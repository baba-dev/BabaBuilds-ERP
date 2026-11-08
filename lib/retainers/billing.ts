import "server-only";
import fs from "fs";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { decimalToNumber, toDecimal } from "@/lib/money";
import { calculateInvoiceTotals } from "@/lib/invoice/totals";
import { resolveTaxRate } from "@/lib/invoice/tax-resolver";
import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import { renderInvoicePdf } from "@/lib/invoice-renderers/render-invoice-pdf";
import { buildPrivatePath, ensureDir } from "@/lib/uploads/private-storage";
import { getNextInvoiceNumber, isUniqueConstraintError } from "@/lib/document-numbering";
import { assertFreeTierMonthlyInvoiceAllowed, canInjectGatewayPaymentLinks } from "@/lib/entitlements";
import { decrypt } from "@/lib/encryption";
import { generateTenantPaymentLink } from "@/lib/razorpay-links";
import { generateStripePaymentLink } from "@/lib/stripe-links";
import { sendEmail } from "@/lib/mailer";
import { buildInvoiceDeliveryEmail } from "@/lib/notifications/transactional-email-templates";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { invalidateDashboardCacheForWorkspace } from "@/lib/dashboard-cache";
import { logActivity } from "@/lib/security/activity-log";
import { addRetainerEvent } from "@/lib/retainers/events";
import { advanceBillingDate, isFinished } from "@/lib/retainers/schedule";
import { startOfUtcDay } from "@/lib/retainers/status";

export type BillResult =
  | { ok: true; invoice: { id: string; invoiceNumber: string }; emailed: boolean; completed: boolean }
  | { ok: false; code: string; message: string; skipped?: boolean };

class ClaimLost extends Error {}

function financialYear(date: Date) {
  const y = date.getFullYear();
  const yy = (n: number) => String(n).slice(-2);
  return date.getMonth() + 1 < 4 ? `${yy(y - 1)}-${yy(y)}` : `${yy(y)}-${yy(y + 1)}`;
}

/**
 * Bills one cycle of a retainer. The single implementation behind the cron job and "Bill now".
 * Safe against concurrent runs: the schedule is advanced with a compare-and-set on the billing date,
 * so exactly one caller can turn a given cycle into an invoice.
 */
export async function billRetainer(args: {
  retainerId: string;
  workspaceId?: string;
  trigger: "cron" | "manual";
  actorUserId?: string | null;
  now?: Date;
}): Promise<BillResult> {
  const now = args.now ?? new Date();
  const retainer = await prisma.retainer.findFirst({
    where: { id: args.retainerId, ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}) },
    include: { client: true, items: true, meteredUsages: { where: { status: "PENDING" } } },
  });
  if (!retainer) return { ok: false, code: "RETAINER_NOT_FOUND", message: "Retainer not found." };
  const workspaceId = retainer.workspaceId;

  if (retainer.status !== "ACTIVE") return { ok: false, code: "NOT_ACTIVE", message: "Only an active retainer can be billed.", skipped: true };
  if (args.trigger === "cron" && startOfUtcDay(retainer.nextBillingDate) > startOfUtcDay(now)) {
    return { ok: false, code: "NOT_DUE", message: "Not due yet.", skipped: true };
  }

  const limits = { endDate: retainer.endDate, maxCycles: retainer.maxCycles, cyclesBilled: retainer.cyclesBilled };
  if (isFinished(retainer.nextBillingDate, limits)) {
    await prisma.$transaction(async (tx) => {
      const r = await tx.retainer.updateMany({ where: { id: retainer.id, status: "ACTIVE" }, data: { status: "COMPLETED" } });
      if (r.count) await addRetainerEvent(tx, { workspaceId, retainerId: retainer.id, type: "COMPLETED", message: "Reached its end date or cycle limit.", actorUserId: args.actorUserId });
    });
    return { ok: false, code: "COMPLETED", message: "This retainer has reached its end date or cycle limit.", skipped: true };
  }

  const fail = async (code: string, message: string): Promise<BillResult> => {
    await prisma.retainer.update({ where: { id: retainer.id }, data: { lastError: message.slice(0, 500), lastErrorAt: new Date() } }).catch(() => null);
    await addRetainerEvent(prisma, { workspaceId, retainerId: retainer.id, type: "BILL_FAILED", message, actorUserId: args.actorUserId }).catch(() => null);
    dispatchNotification({ event: "BILLING_FAILED", workspaceId, data: { clientName: retainer.client.name, message } }).catch(() => null);
    return { ok: false, code, message };
  };

  try {
    const profile = await prisma.businessProfile.findUnique({ where: { workspaceId }, include: { workspace: true, primaryBankAccount: true } });
    if (!profile) return await fail("PROFILE_REQUIRED", "Business profile missing. Complete it to generate invoices.");
    const blocked = await assertFreeTierMonthlyInvoiceAllowed(workspaceId, now);
    if (blocked) return await fail("FREE_INVOICE_LIMIT", blocked.message);

    const currency = retainer.currency || profile.workspace?.baseCurrency || "INR";
    const countryCode = profile.workspace?.countryCode || "IN";
    const userLocale = countryCode === "IN" ? "en-IN" : "en-US";
    const billingMonth = format(retainer.nextBillingDate, "MMMM yyyy");

    const services: { title: string; amount: number; taxRate: number; sacCode: string | null }[] = retainer.items.map((item) => ({
      title: retainer.autoAppendMonth ? `${item.title} (${billingMonth})` : item.title,
      amount: decimalToNumber(item.unitPrice) * item.quantity,
      taxRate: item.taxRate || 0,
      sacCode: item.sacCode || retainer.sacCode || profile.defaultSacCode || null,
    }));
    for (const usage of retainer.meteredUsages) {
      services.push({ title: usage.description, amount: decimalToNumber(usage.unitPrice) * decimalToNumber(usage.quantity), taxRate: 0, sacCode: null });
    }
    if (services.length === 0) return await fail("NO_ITEMS", "This retainer has no items or pending usage to bill.");

    const resolution = resolveTaxRate({
      countryCode,
      isTaxExempt: Boolean(retainer.client.isExport),
      serviceTaxRates: services.map((s) => s.taxRate),
      workspaceDefaultTaxRate: profile.defaultTaxRate ?? null,
    });
    if (resolution.requiresUserInput) return await fail("TAX_RATE_REQUIRED", "A tax rate is missing for this retainer. Set a workspace default or edit its lines.");
    const totals = calculateInvoiceTotals({
      services: services.map((s) => ({ amount: s.amount, taxRate: s.taxRate })),
      isTaxExempt: Boolean(retainer.client.isExport),
      defaultTaxRate: resolution.taxRate,
    });
    const total = toDecimal(totals.total).toDecimalPlaces(2);
    const dueDate = new Date(now.getTime() + retainer.paymentTermsDays * 86_400_000);
    const nextDate = advanceBillingDate(retainer.nextBillingDate, retainer.frequency);
    const finishedAfter = isFinished(nextDate, { ...limits, cyclesBilled: retainer.cyclesBilled + 1 });
    const baseDescription = retainer.autoAppendMonth ? `${retainer.name || "Retainer Billing"} (${billingMonth})` : retainer.name || "Retainer Billing";

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const { invoiceNumber } = await getNextInvoiceNumber(prisma, workspaceId, now, profile.invoicePrefix || "INV");

      let paymentLink: string | null = null;
      let providerPaymentLinkId: string | null = null;
      let providerGateway: string | null = null;
      if (canInjectGatewayPaymentLinks({ planTier: profile.workspace?.planTier, subscriptionStatus: profile.workspace?.subscriptionStatus, subscriptionEndsAt: profile.workspace?.subscriptionEndsAt })) {
        const gateway = String(profile.defaultGateway || "RAZORPAY").toUpperCase();
        try {
          if (gateway === "RAZORPAY" && currency === "INR" && profile.razorpayKeyId && profile.razorpayKeySecret) {
            const link = await generateTenantPaymentLink({
              amount: total.toNumber(), currency, description: `Invoice ${invoiceNumber}`, invoiceDueDate: dueDate,
              customerDetails: { name: retainer.client.name, email: retainer.client.email ?? undefined },
              tenantKeyId: profile.razorpayKeyId, tenantKeySecret: decrypt(profile.razorpayKeySecret),
            });
            if (link) { paymentLink = link.url; providerPaymentLinkId = link.linkId; providerGateway = "RAZORPAY"; }
          } else if (gateway === "STRIPE" && profile.stripeSecretKey) {
            const link = await generateStripePaymentLink({ amount: total.toNumber(), currency, description: `Invoice ${invoiceNumber}`, invoiceNumber, tenantSecretKey: decrypt(profile.stripeSecretKey) });
            if (link) { paymentLink = link.url; providerPaymentLinkId = link.linkId; providerGateway = "STRIPE"; }
          }
        } catch (error) {
          console.error("[retainer billing] payment link failed", error);
        }
      }

      const pdfFilename = `${invoiceNumber.replace(/\//g, "_")}.pdf`;
      const pdfPath = buildPrivatePath("invoices", [workspaceId, pdfFilename]);
      const relativePdfPath = `/invoices/${workspaceId}/${pdfFilename}`;
      await ensureDir(buildPrivatePath("invoices", [workspaceId]));
      const vm = buildInvoiceViewModel({
        profile,
        client: { name: retainer.client.name, address: retainer.client.address, country: retainer.client.country, email: retainer.client.email, taxId: retainer.client.taxId, isExport: retainer.client.isExport, logoUrl: retainer.client.logoUrl },
        invoiceNumber, date: now, dueDate, billingMonth,
        sacCode: retainer.sacCode || profile.defaultSacCode || "N/A",
        services: services.map((s) => ({ title: s.title, nicDetails: s.title, amount: s.amount, sacCode: s.sacCode })),
        totals,
        formattedTotal: total.toNumber().toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        baseCurrency: currency, userLocale, paymentLink, status: "PENDING",
      });
      await fs.promises.writeFile(pdfPath, await renderInvoicePdf(vm), { mode: 0o600 });

      try {
        const invoice = await prisma.$transaction(async (tx) => {
          const claim = await tx.retainer.updateMany({
            where: { id: retainer.id, status: "ACTIVE", nextBillingDate: retainer.nextBillingDate },
            data: { nextBillingDate: nextDate, cyclesBilled: { increment: 1 }, lastBilledAt: now, lastError: null, lastErrorAt: null, ...(finishedAfter ? { status: "COMPLETED" } : {}) },
          });
          if (claim.count === 0) throw new ClaimLost();
          const created = await tx.invoice.create({
            data: {
              workspaceId, clientId: retainer.clientId, retainerId: retainer.id, invoiceNumber,
              financialYear: financialYear(now), billingMonth, invoiceDate: now, clientName: retainer.client.name,
              serviceDescription: baseDescription,
              subtotal: toDecimal(totals.subtotal).toDecimalPlaces(2), taxRate: totals.taxRate,
              taxAmount: toDecimal(totals.taxAmount).toDecimalPlaces(2), grandTotal: total, totalAmount: total, taxMode: totals.taxMode,
              status: "PENDING", currency, exchangeRate: retainer.exchangeRate, baseGrandTotal: total.mul(retainer.exchangeRate).toDecimalPlaces(2),
              source: "RETAINER", dueDate, paymentTermsDays: retainer.paymentTermsDays, pdfPath: relativePdfPath,
              providerGateway, providerPaymentLinkId,
              items: { create: services.map((s) => ({ description: s.title, quantity: 1, unitPrice: toDecimal(s.amount), totalAmount: toDecimal(s.amount), taxRate: s.taxRate, sacCode: s.sacCode })) },
            },
            select: { id: true, invoiceNumber: true },
          });
          if (retainer.meteredUsages.length) {
            await tx.meteredUsage.updateMany({ where: { id: { in: retainer.meteredUsages.map((u) => u.id) } }, data: { status: "BILLED", billedInInvoiceId: created.id } });
          }
          await addRetainerEvent(tx, { workspaceId, retainerId: retainer.id, type: "BILLED", message: created.invoiceNumber, actorUserId: args.actorUserId, metadata: { invoiceId: created.id, total: total.toFixed(2), trigger: args.trigger } });
          if (finishedAfter) await addRetainerEvent(tx, { workspaceId, retainerId: retainer.id, type: "COMPLETED", message: "Reached its end date or cycle limit.", actorUserId: args.actorUserId });
          return created;
        });

        let emailed = false;
        if (retainer.emailInvoice && retainer.client.email) {
          try {
            const mail = buildInvoiceDeliveryEmail({
              companyName: profile.companyName, clientName: retainer.client.name, invoiceNumber, billingMonth,
              amountFormatted: `${currency} ${total.toNumber().toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            });
            await sendEmail({ route: "user", profile, to: retainer.client.email, subject: mail.subject, html: mail.html, text: mail.text, attachments: [{ filename: pdfFilename, path: pdfPath }] });
            await prisma.invoice.update({ where: { id: invoice.id }, data: { sentAt: new Date() } });
            emailed = true;
          } catch (error) {
            await addRetainerEvent(prisma, { workspaceId, retainerId: retainer.id, type: "EMAIL_FAILED", message: error instanceof Error ? error.message.slice(0, 300) : "Email failed", actorUserId: args.actorUserId }).catch(() => null);
          }
        }
        dispatchNotification({ event: "INVOICE_GENERATED", workspaceId, data: { invoiceNumber, clientName: retainer.client.name, amount: `${currency} ${total.toFixed(2)}`, pdfUrl: relativePdfPath } }).catch(() => null);
        logActivity({ action: "retainer_billed", status: "SUCCESS", workspaceId, actor: { userId: args.actorUserId ?? "system", email: "system" }, entity: { type: "retainer", id: retainer.id }, metadata: { invoiceId: invoice.id, trigger: args.trigger } });
        try { invalidateDashboardCacheForWorkspace(workspaceId); } catch { /* best effort */ }
        return { ok: true, invoice, emailed, completed: finishedAfter };
      } catch (error) {
        await fs.promises.unlink(pdfPath).catch(() => undefined);
        if (error instanceof ClaimLost) return { ok: false, code: "ALREADY_BILLED", message: "This cycle was just billed by another request.", skipped: true };
        if (attempt < 5 && isUniqueConstraintError(error)) continue;
        throw error;
      }
    }
    return await fail("NUMBERING_CONFLICT", "Could not allocate an invoice number. It will be retried on the next run.");
  } catch (error) {
    console.error(`[retainer billing] ${retainer.id} failed`, error);
    return await fail("BILLING_FAILED", error instanceof Error ? error.message : "Unexpected billing error.");
  }
}

