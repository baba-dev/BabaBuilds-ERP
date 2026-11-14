import "server-only";
import { snapshotGstFields } from "@/lib/gst/source";
import fs from "fs";
import { format } from "date-fns";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalToNumber, toDecimal } from "@/lib/money";
import { calculateInvoiceTotals, type InvoiceTotals } from "@/lib/invoice/totals";
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
import { retainerMrr } from "@/lib/retainers/mrr";
import { advanceBillingDate, applyPercentChanges, extendLimits, isFinished } from "@/lib/retainers/schedule";
import { startOfUtcDay } from "@/lib/retainers/status";
import { supplierChargesGst } from "@/lib/msme/threshold";
import { getClientRecipients } from "@/lib/clients/service";

export type BillResult =
  | { ok: true; invoice: { id: string; invoiceNumber: string }; emailed: boolean; completed: boolean }
  | { ok: false; code: string; message: string; skipped?: boolean };

class ClaimLost extends Error {}

function financialYear(date: Date) {
  const y = date.getFullYear();
  const yy = (n: number) => String(n).slice(-2);
  return date.getMonth() + 1 < 4 ? `${yy(y - 1)}-${yy(y)}` : `${yy(y)}-${yy(y + 1)}`;
}

const billingInclude = {
  client: true,
  items: true,
  meteredUsages: { where: { status: "PENDING" } },
  priceChanges: { where: { appliedAt: null }, orderBy: { effectiveDate: "asc" as const } },
} satisfies Prisma.RetainerInclude;
type BillingRetainer = Prisma.RetainerGetPayload<{ include: typeof billingInclude }>;
type BillingProfile = Prisma.BusinessProfileGetPayload<{ include: { workspace: true; primaryBankAccount: true } }>;

type Service = { title: string; amount: number; taxRate: number; sacCode: string | null };
export type CyclePlan = {
  currency: string;
  userLocale: string;
  billingMonth: string;
  services: Service[];
  totals: InvoiceTotals;
  total: Prisma.Decimal;
  dueDate: Date;
  baseDescription: string;
  /** New unit prices when a scheduled change takes effect on this cycle. */
  priceUpdates: Array<{ id: string; unitPrice: number }>;
  appliedChangeIds: string[];
};

/** Everything a cycle will charge, computed without side effects (shared by billing and the PDF preview). */
export function planCycle(retainer: BillingRetainer, profile: BillingProfile, now: Date): { ok: true; plan: CyclePlan } | { ok: false; code: string; message: string } {
  const currency = retainer.currency || profile.workspace?.baseCurrency || "INR";
  const countryCode = profile.workspace?.countryCode || "IN";
  const billingMonth = format(retainer.nextBillingDate, "MMMM yyyy");

  // Scheduled price changes that take effect on or before this cycle are applied to every line.
  const due = retainer.priceChanges.filter((c) => c.effectiveDate.getTime() <= retainer.nextBillingDate.getTime());
  const percents = due.map((c) => c.percent);
  const priceUpdates = percents.length ? retainer.items.map((i) => ({ id: i.id, unitPrice: applyPercentChanges(decimalToNumber(i.unitPrice), percents) })) : [];
  const priceOf = (i: BillingRetainer["items"][number]) => priceUpdates.find((u) => u.id === i.id)?.unitPrice ?? decimalToNumber(i.unitPrice);

  const services: Service[] = retainer.items.map((item) => ({
    title: retainer.autoAppendMonth ? `${item.title} (${billingMonth})` : item.title,
    amount: priceOf(item) * item.quantity,
    taxRate: item.taxRate || 0,
    sacCode: item.sacCode || retainer.sacCode || profile.defaultSacCode || null,
  }));
  // Usage is taxed at its own rate, falling back to the retainer's main rate.
  const mainRate = retainer.items.find((i) => (i.taxRate ?? 0) > 0)?.taxRate ?? 0;
  for (const usage of retainer.meteredUsages) {
    services.push({ title: usage.description, amount: decimalToNumber(usage.unitPrice) * decimalToNumber(usage.quantity), taxRate: usage.taxRate ?? mainRate, sacCode: null });
  }
  if (services.length === 0) return { ok: false, code: "NO_ITEMS", message: "This retainer has no items or pending usage to bill." };

  const resolution = resolveTaxRate({
    countryCode,
    isTaxExempt: Boolean(retainer.client.isExport) || !supplierChargesGst(profile, countryCode),
    serviceTaxRates: services.map((s) => s.taxRate),
    workspaceDefaultTaxRate: profile.defaultTaxRate ?? null,
  });
  if (resolution.requiresUserInput) return { ok: false, code: "TAX_RATE_REQUIRED", message: "A tax rate is missing for this retainer. Set a workspace default or edit its lines." };
  const totals = calculateInvoiceTotals({
    services: services.map((s) => ({ amount: s.amount, taxRate: s.taxRate })),
    isTaxExempt: Boolean(retainer.client.isExport) || !supplierChargesGst(profile, countryCode),
    defaultTaxRate: resolution.taxRate,
  });
  return {
    ok: true,
    plan: {
      currency,
      userLocale: countryCode === "IN" ? "en-IN" : "en-US",
      billingMonth,
      services,
      totals,
      total: toDecimal(totals.total).toDecimalPlaces(2),
      dueDate: new Date(now.getTime() + retainer.paymentTermsDays * 86_400_000),
      baseDescription: retainer.autoAppendMonth ? `${retainer.name || "Retainer Billing"} (${billingMonth})` : retainer.name || "Retainer Billing",
      priceUpdates,
      appliedChangeIds: due.map((c) => c.id),
    },
  };
}

function buildVm(retainer: BillingRetainer, profile: BillingProfile, plan: CyclePlan, invoiceNumber: string, now: Date, paymentLink: string | null) {
  return buildInvoiceViewModel({
    profile,
    client: { name: retainer.client.name, address: retainer.client.address, country: retainer.client.country, email: retainer.client.email, taxId: retainer.client.taxId, isExport: retainer.client.isExport, logoUrl: retainer.client.logoUrl },
    invoiceNumber, date: now, dueDate: plan.dueDate, billingMonth: plan.billingMonth,
    sacCode: retainer.sacCode || profile.defaultSacCode || "N/A",
    services: plan.services.map((s) => ({ title: s.title, nicDetails: s.title, amount: s.amount, sacCode: s.sacCode })),
    totals: plan.totals,
    formattedTotal: plan.total.toNumber().toLocaleString(plan.userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    baseCurrency: plan.currency, userLocale: plan.userLocale, paymentLink, status: "PENDING",
  });
}

/** Renders the next cycle's invoice as a PDF without issuing it or touching any data. */
export async function renderNextInvoicePreview(args: { retainerId: string; workspaceId: string; now?: Date }): Promise<{ ok: true; pdf: Uint8Array; fileName: string } | { ok: false; status: number; code: string; message: string }> {
  const now = args.now ?? new Date();
  const retainer = await prisma.retainer.findFirst({ where: { id: args.retainerId, workspaceId: args.workspaceId }, include: billingInclude });
  if (!retainer) return { ok: false, status: 404, code: "RETAINER_NOT_FOUND", message: "Retainer not found." };
  if (retainer.status === "CANCELLED" || retainer.status === "COMPLETED") return { ok: false, status: 409, code: "NOT_ACTIVE", message: "There is no upcoming invoice for a finished retainer." };
  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId: args.workspaceId }, include: { workspace: true, primaryBankAccount: true } });
  if (!profile) return { ok: false, status: 422, code: "PROFILE_REQUIRED", message: "Complete your business profile first." };
  const planned = planCycle(retainer, profile, now);
  if (!planned.ok) return { ok: false, status: 422, code: planned.code, message: planned.message };
  const pdf = await renderInvoicePdf(buildVm(retainer, profile, planned.plan, "PREVIEW", now, null));
  return { ok: true, pdf, fileName: `preview-${planned.plan.billingMonth.replace(/\s+/g, "-")}.pdf` };
}

async function openFailureTask(retainer: BillingRetainer, message: string) {
  const marker = `retainer:${retainer.id}`;
  const existing = await prisma.task.findFirst({ where: { workspaceId: retainer.workspaceId, status: "PENDING", description: { contains: marker } } });
  if (existing) return;
  await prisma.task.create({
    data: {
      workspaceId: retainer.workspaceId,
      title: `Fix retainer billing: ${retainer.name || retainer.client.name} (${retainer.client.name})`,
      description: `${message}\n\nOpen /retainers?retainer=${retainer.id} to fix it and retry. [${marker}]`,
      dueDate: new Date(),
    },
  });
}

/**
 * Bills one cycle of a retainer. The single implementation behind the cron job, "Bill now" and bulk billing.
 * Safe against concurrent runs: the schedule is advanced with a compare-and-set on the billing date,
 * so exactly one caller can turn a given cycle into an invoice.
 */
export async function billRetainer(args: { retainerId: string; workspaceId?: string; trigger: "cron" | "manual"; actorUserId?: string | null; now?: Date }): Promise<BillResult> {
  const now = args.now ?? new Date();
  const retainer = await prisma.retainer.findFirst({
    where: { id: args.retainerId, ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}) },
    include: billingInclude,
  });
  if (!retainer) return { ok: false, code: "RETAINER_NOT_FOUND", message: "Retainer not found." };
  const workspaceId = retainer.workspaceId;

  if (retainer.status !== "ACTIVE") return { ok: false, code: "NOT_ACTIVE", message: "Only an active retainer can be billed.", skipped: true };
  if (args.trigger === "cron" && startOfUtcDay(retainer.nextBillingDate) > startOfUtcDay(now)) return { ok: false, code: "NOT_DUE", message: "Not due yet.", skipped: true };

  let limits = { endDate: retainer.endDate, maxCycles: retainer.maxCycles, cyclesBilled: retainer.cyclesBilled };
  const canRenew = retainer.autoRenew && (retainer.renewCycles ?? 0) > 0;
  if (isFinished(retainer.nextBillingDate, limits)) {
    if (canRenew) {
      const ext = extendLimits(limits, retainer.frequency, retainer.renewCycles!);
      await prisma.retainer.update({ where: { id: retainer.id }, data: ext });
      await addRetainerEvent(prisma, { workspaceId, retainerId: retainer.id, type: "RENEWED", message: `Extended by ${retainer.renewCycles} cycles`, actorUserId: args.actorUserId });
      limits = { ...limits, ...ext };
    } else {
      await prisma.$transaction(async (tx) => {
        const r = await tx.retainer.updateMany({ where: { id: retainer.id, status: "ACTIVE" }, data: { status: "COMPLETED" } });
        if (r.count) await addRetainerEvent(tx, { workspaceId, retainerId: retainer.id, type: "COMPLETED", message: "Reached its end date or cycle limit.", actorUserId: args.actorUserId, metadata: { mrr: 0 } });
      });
      return { ok: false, code: "COMPLETED", message: "This retainer has reached its end date or cycle limit.", skipped: true };
    }
  }

  const fail = async (code: string, message: string): Promise<BillResult> => {
    const firstFailure = !retainer.lastError;
    await prisma.retainer.update({ where: { id: retainer.id }, data: { lastError: message.slice(0, 500), lastErrorAt: new Date() } }).catch(() => null);
    await addRetainerEvent(prisma, { workspaceId, retainerId: retainer.id, type: "BILL_FAILED", message, actorUserId: args.actorUserId }).catch(() => null);
    if (firstFailure) {
      await openFailureTask(retainer, message).catch(() => null);
      dispatchNotification({ event: "BILLING_FAILED", workspaceId, data: { clientName: retainer.client.name, message } }).catch(() => null);
    }
    return { ok: false, code, message };
  };

  try {
    const profile = await prisma.businessProfile.findUnique({ where: { workspaceId }, include: { workspace: true, primaryBankAccount: true } });
    if (!profile) return await fail("PROFILE_REQUIRED", "Business profile missing. Complete it to generate invoices.");
    const blocked = await assertFreeTierMonthlyInvoiceAllowed(workspaceId, now);
    if (blocked) return await fail("FREE_INVOICE_LIMIT", blocked.message);

    const planned = planCycle(retainer, profile, now);
    if (!planned.ok) return await fail(planned.code, planned.message);
    const { plan } = planned;
    const { currency, total } = plan;

    const nextDate = advanceBillingDate(retainer.nextBillingDate, retainer.frequency);
    const afterLimits = { ...limits, cyclesBilled: retainer.cyclesBilled + 1 };
    const reachesEnd = isFinished(nextDate, afterLimits);
    const renewsInstead = reachesEnd && canRenew;
    const renewal = renewsInstead ? extendLimits(afterLimits, retainer.frequency, retainer.renewCycles!) : null;
    const finishedAfter = reachesEnd && !renewsInstead;

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
              amount: total.toNumber(), currency, description: `Invoice ${invoiceNumber}`, invoiceDueDate: plan.dueDate,
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
      await fs.promises.writeFile(pdfPath, await renderInvoicePdf(buildVm(retainer, profile, plan, invoiceNumber, now, paymentLink)), { mode: 0o600 });

      try {
        const invoice = await prisma.$transaction(async (tx) => {
          const claim = await tx.retainer.updateMany({
            where: { id: retainer.id, status: "ACTIVE", nextBillingDate: retainer.nextBillingDate },
            data: {
              nextBillingDate: nextDate, cyclesBilled: { increment: 1 }, lastBilledAt: now, lastError: null, lastErrorAt: null,
              ...(finishedAfter ? { status: "COMPLETED" } : {}), ...(renewal ?? {}),
            },
          });
          if (claim.count === 0) throw new ClaimLost();
          const created = await tx.invoice.create({
            data: {
              workspaceId, clientId: retainer.clientId, retainerId: retainer.id, invoiceNumber,
              financialYear: financialYear(now), billingMonth: plan.billingMonth, invoiceDate: now, clientName: retainer.client.name,
              serviceDescription: plan.baseDescription,
              subtotal: toDecimal(plan.totals.subtotal).toDecimalPlaces(2), taxRate: plan.totals.taxRate,
              taxAmount: toDecimal(plan.totals.taxAmount).toDecimalPlaces(2), grandTotal: total, totalAmount: total, taxMode: plan.totals.taxMode,
              status: "PENDING", currency, exchangeRate: retainer.exchangeRate, baseGrandTotal: total.mul(retainer.exchangeRate).toDecimalPlaces(2),
              ...snapshotGstFields(retainer.client), source: "RETAINER", dueDate: plan.dueDate, paymentTermsDays: retainer.paymentTermsDays, pdfPath: relativePdfPath,
              providerGateway, providerPaymentLinkId,
              items: { create: plan.services.map((s) => ({ description: s.title, quantity: 1, unitPrice: toDecimal(s.amount), totalAmount: toDecimal(s.amount), taxRate: s.taxRate, sacCode: s.sacCode })) },
            },
            select: { id: true, invoiceNumber: true },
          });
          if (retainer.meteredUsages.length) {
            await tx.meteredUsage.updateMany({ where: { id: { in: retainer.meteredUsages.map((u) => u.id) } }, data: { status: "BILLED", billedInInvoiceId: created.id } });
          }
          if (plan.appliedChangeIds.length) {
            for (const u of plan.priceUpdates) await tx.retainerItem.update({ where: { id: u.id }, data: { unitPrice: u.unitPrice } });
            await tx.retainerPriceChange.updateMany({ where: { id: { in: plan.appliedChangeIds } }, data: { appliedAt: now } });
            const mrr = retainerMrr({ status: finishedAfter ? "COMPLETED" : "ACTIVE", frequency: retainer.frequency, exchangeRate: retainer.exchangeRate, items: retainer.items.map((i) => ({ quantity: i.quantity, taxRate: i.taxRate, unitPrice: plan.priceUpdates.find((p) => p.id === i.id)?.unitPrice ?? i.unitPrice })) });
            await addRetainerEvent(tx, { workspaceId, retainerId: retainer.id, type: "PRICE_CHANGED", message: `Applied ${plan.appliedChangeIds.length} scheduled change(s)`, actorUserId: args.actorUserId, metadata: { mrr } });
          }
          await addRetainerEvent(tx, { workspaceId, retainerId: retainer.id, type: "BILLED", message: created.invoiceNumber, actorUserId: args.actorUserId, metadata: { invoiceId: created.id, total: total.toFixed(2), trigger: args.trigger } });
          if (renewal) await addRetainerEvent(tx, { workspaceId, retainerId: retainer.id, type: "RENEWED", message: `Extended by ${retainer.renewCycles} cycles`, actorUserId: args.actorUserId });
          if (finishedAfter) await addRetainerEvent(tx, { workspaceId, retainerId: retainer.id, type: "COMPLETED", message: "Reached its end date or cycle limit.", actorUserId: args.actorUserId, metadata: { mrr: 0 } });
          return created;
        });

        let emailed = false;
        const recipients = retainer.emailInvoice ? await getClientRecipients(retainer.clientId, workspaceId, "invoice") : [];
        if (retainer.emailInvoice && recipients.length > 0) {
          try {
            const mail = buildInvoiceDeliveryEmail({
              companyName: profile.companyName, clientName: retainer.client.name, invoiceNumber, billingMonth: plan.billingMonth,
              amountFormatted: `${currency} ${total.toNumber().toLocaleString(plan.userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            });
            await sendEmail({ route: "user", profile, to: recipients.join(", "), subject: mail.subject, html: mail.html, text: mail.text, attachments: [{ filename: pdfFilename, path: pdfPath }] });
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
