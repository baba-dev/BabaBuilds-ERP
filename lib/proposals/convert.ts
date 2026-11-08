import "server-only";
import { snapshotGstFields } from "@/lib/gst/source";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { getNextInvoiceNumber, isUniqueConstraintError } from "@/lib/document-numbering";
import { assertFreeTierMonthlyInvoiceAllowed, canInjectGatewayPaymentLinks } from "@/lib/entitlements";
import { buildPrivatePath, ensureDir } from "@/lib/uploads/private-storage";
import { generateInvoicePDF } from "@/lib/pdf/generator";
import { generateTenantPaymentLink } from "@/lib/razorpay-links";
import { generateStripePaymentLink } from "@/lib/stripe-links";
import { logActivity } from "@/lib/security/activity-log";
import { addProposalEvent } from "@/lib/proposals/events";

export type ConvertResult =
  | { ok: true; alreadyConverted: boolean; invoice: { id: string; invoiceNumber: string }; retainerId: string | null }
  | { ok: false; status: number; code: string; message: string };

type ConvertArgs = {
  workspaceId: string;
  proposalId: string;
  actorUserId: string | null;
  invoiceDate?: Date;
  billingMonth?: string;
  createRetainer?: boolean;
};

function financialYear(date: Date) {
  const shortYear = date.getFullYear().toString().slice(-2);
  const next = (parseInt(shortYear, 10) + 1).toString().padStart(2, "0");
  const prev = (parseInt(shortYear, 10) - 1).toString().padStart(2, "0");
  return date.getMonth() + 1 <= 3 ? `${prev}-${shortYear}` : `${shortYear}-${next}`;
}

/**
 * The single way a proposal becomes an invoice (UI, AI tools). It bills exactly what the client accepted:
 * the stored totals, tax rate and currency, and only the lines they kept selected. Re-running it returns the
 * invoice that already exists instead of creating a second one.
 */
export async function convertProposal(args: ConvertArgs): Promise<ConvertResult> {
  const { workspaceId, proposalId, actorUserId } = args;

  const existing = await prisma.invoice.findFirst({
    where: { workspaceId, sourceProposalId: proposalId },
    select: { id: true, invoiceNumber: true },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return { ok: true, alreadyConverted: true, invoice: existing, retainerId: null };

  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, workspaceId },
    include: {
      client: true,
      items: { orderBy: { id: "asc" } },
      billingMilestones: true,
      workspace: { select: { planTier: true, subscriptionStatus: true, subscriptionEndsAt: true, baseCurrency: true, countryCode: true } },
    },
  });
  if (!proposal) return { ok: false, status: 404, code: "PROPOSAL_NOT_FOUND", message: "Proposal not found." };
  if (proposal.status !== "ACCEPTED") {
    return { ok: false, status: 409, code: "PROPOSAL_NOT_ACCEPTED", message: "Only an accepted proposal can be converted to an invoice." };
  }

  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId }, include: { workspace: true } });
  if (!profile) return { ok: false, status: 422, code: "PROFILE_REQUIRED", message: "Complete your business profile before invoicing." };

  const invoiceDate = args.invoiceDate ?? new Date();
  const limitErr = await assertFreeTierMonthlyInvoiceAllowed(workspaceId, invoiceDate);
  if (limitErr) return { ok: false, status: 402, code: "FREE_INVOICE_LIMIT", message: "Your plan's monthly invoice limit is reached." };

  const lines = proposal.items.filter((i) => !i.isOptional || i.isSelected);
  if (lines.length === 0) return { ok: false, status: 422, code: "NO_SELECTED_ITEMS", message: "No items were selected on this proposal." };

  const currency = proposal.currency;
  const countryCode = proposal.workspace?.countryCode || "IN";
  const subtotal = proposal.subtotal.toDecimalPlaces(2);
  const taxAmount = proposal.estimatedTax.toDecimalPlaces(2);
  const total = proposal.totalAmount.toDecimalPlaces(2);
  // Proposals store a percentage; invoices and retainers store a fraction.
  const taxFraction = proposal.taxRatePercent / 100;
  const taxMode: "taxable" | "exempt" = proposal.taxRatePercent > 0 ? "taxable" : "exempt";
  const dueDate = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + 7);
  const billingMonth = args.billingMonth || invoiceDate.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const locale = countryCode === "IN" ? "en-IN" : "en-US";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { invoiceNumber } = await getNextInvoiceNumber(prisma, workspaceId, invoiceDate, profile.invoicePrefix || "INV");

    // Payment link: best-effort, never blocks the conversion.
    let paymentLink: string | null = null;
    let providerPaymentLinkId: string | null = null;
    let providerGateway: string | null = null;
    const gateway = String(profile.defaultGateway || "RAZORPAY").toUpperCase();
    if (canInjectGatewayPaymentLinks({ planTier: proposal.workspace?.planTier, subscriptionStatus: proposal.workspace?.subscriptionStatus, subscriptionEndsAt: proposal.workspace?.subscriptionEndsAt })) {
      try {
        if (gateway === "RAZORPAY" && currency === "INR" && profile.razorpayKeyId && profile.razorpayKeySecret) {
          const r = await generateTenantPaymentLink({
            amount: total.toNumber(),
            currency,
            description: `Invoice ${invoiceNumber}`,
            invoiceDueDate: dueDate,
            customerDetails: { name: proposal.client.name, email: proposal.client.email ?? undefined },
            tenantKeyId: profile.razorpayKeyId,
            tenantKeySecret: decrypt(profile.razorpayKeySecret),
          });
          if (r) ({ url: paymentLink, linkId: providerPaymentLinkId, gateway: providerGateway } = { url: r.url, linkId: r.linkId, gateway: "RAZORPAY" });
        }
        if (!paymentLink && gateway === "STRIPE" && profile.stripeSecretKey) {
          const r = await generateStripePaymentLink({
            amount: total.toNumber(),
            currency,
            description: `Invoice ${invoiceNumber}`,
            invoiceNumber,
            tenantSecretKey: decrypt(profile.stripeSecretKey),
          });
          if (r) ({ url: paymentLink, linkId: providerPaymentLinkId, gateway: providerGateway } = { url: r.url, linkId: r.linkId, gateway: "STRIPE" });
        }
      } catch (error) {
        console.error("Proposal conversion: payment link failed", error);
      }
    }

    const dir = buildPrivatePath("invoices", [workspaceId]);
    await ensureDir(dir);
    const pdfFilename = `${invoiceNumber.replace(/\//g, "_")}.pdf`;
    const pdfPath = buildPrivatePath("invoices", [workspaceId, pdfFilename]);
    const relativePdfPath = `/invoices/${workspaceId}/${pdfFilename}`;

    const pdfBytes = await generateInvoicePDF({
      profile,
      client: proposal.client,
      invoiceNumber,
      date: invoiceDate,
      dueDate,
      billingMonth,
      sacCode: "",
      services: lines.map((l) => ({ title: l.title, nicDetails: "", amount: l.total.toNumber() })),
      totals: {
        subtotal: subtotal.toNumber(),
        taxRate: taxFraction,
        taxAmount: taxAmount.toNumber(),
        total: total.toNumber(),
        taxMode,
      },
      formattedTotal: total.toNumber().toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      baseCurrency: currency,
      userLocale: locale,
      paymentLink,
      status: "PENDING",
    });
    await fs.promises.writeFile(pdfPath, pdfBytes, { mode: 0o600 });

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Claim the proposal first: only one concurrent conversion can move it ACCEPTED -> INVOICED.
        const claim = await tx.proposal.updateMany({
          where: { id: proposal.id, workspaceId, status: "ACCEPTED" },
          data: { status: "INVOICED", firstConvertedAt: proposal.firstConvertedAt ?? new Date() },
        });
        if (claim.count === 0) return null;

        const invoice = await tx.invoice.create({
          data: {
            workspaceId,
            invoiceNumber,
            financialYear: financialYear(invoiceDate),
            billingMonth,
            invoiceDate,
            dueDate,
            clientName: proposal.client.name,
            clientId: proposal.clientId,
            sacCode: null,
            serviceDescription: proposal.title,
            subtotal,
            taxRate: taxFraction,
            taxAmount,
            grandTotal: total,
            taxMode,
            totalAmount: total,
            pdfPath: relativePdfPath,
            status: "PENDING",
            currency,
            exchangeRate: proposal.exchangeRate,
            baseGrandTotal: total.mul(proposal.exchangeRate).toDecimalPlaces(2),
            source: "PROPOSAL",
            ...snapshotGstFields(proposal.client),
            sourceProposalId: proposal.id,
            providerGateway,
            providerPaymentLinkId,
            items: {
              create: lines.map((l) => ({
                productId: null,
                description: l.title,
                quantity: l.quantity || 1,
                unitPrice: l.unitPrice,
                taxRate: taxFraction,
                totalAmount: l.total,
              })),
            },
          },
          select: { id: true, invoiceNumber: true },
        });

        await tx.proposalConversion.create({
          data: { workspaceId, proposalId: proposal.id, conversionType: "ONE_TIME_INVOICE", convertedByUserId: actorUserId, invoiceId: invoice.id },
        });

        let retainerId: string | null = null;
        const recurring = lines.filter((l) => l.isRecurring);
        if (args.createRetainer && recurring.length > 0) {
          const next = new Date(invoiceDate);
          next.setMonth(next.getMonth() + 1);
          const retainer = await tx.retainer.create({
            data: {
              workspaceId,
              clientId: proposal.clientId,
              currency,
              frequency: "MONTHLY",
              status: "ACTIVE",
              nextBillingDate: next,
              autoAppendMonth: true,
              name: proposal.title,
              serviceName: proposal.title,
              sourceProposalId: proposal.id,
              items: {
                create: recurring.map((l) => ({
                  serviceTemplateId: l.serviceTemplateId,
                  title: l.title,
                  quantity: l.quantity || 1,
                  unitPrice: l.unitPrice,
                  taxRate: taxFraction,
                })),
              },
            },
            select: { id: true },
          });
          retainerId = retainer.id;
          await tx.proposalConversion.create({
            data: { workspaceId, proposalId: proposal.id, conversionType: "RETAINER", convertedByUserId: actorUserId, retainerId },
          });
        }

        // Milestones that fed this invoice are now invoiced.
        if (proposal.billingMilestones.length) {
          await tx.billingMilestone.updateMany({ where: { proposalId: proposal.id, workspaceId }, data: { status: "INVOICED", invoiceId: invoice.id } });
        }
        await addProposalEvent(tx, {
          workspaceId,
          proposalId: proposal.id,
          type: "CONVERTED_INVOICE",
          message: invoice.invoiceNumber,
          actorUserId,
          metadata: { invoiceId: invoice.id, retainerId },
        });
        return { invoice, retainerId };
      });

      if (!result) {
        await fs.promises.unlink(pdfPath).catch(() => undefined);
        const winner = await prisma.invoice.findFirst({ where: { workspaceId, sourceProposalId: proposalId }, select: { id: true, invoiceNumber: true } });
        if (winner) return { ok: true, alreadyConverted: true, invoice: winner, retainerId: null };
        return { ok: false, status: 409, code: "PROPOSAL_NOT_ACCEPTED", message: "This proposal was changed while converting. Refresh and try again." };
      }

      logActivity({
        action: "proposal_converted",
        status: "SUCCESS",
        workspaceId,
        actor: { userId: actorUserId || "system", email: "system" },
        entity: { type: "proposal", id: proposal.id },
        metadata: { invoiceId: result.invoice.id, retainerId: result.retainerId },
      });
      return { ok: true, alreadyConverted: false, invoice: result.invoice, retainerId: result.retainerId };
    } catch (error) {
      await fs.promises.unlink(pdfPath).catch(() => undefined);
      if (attempt < 3 && isUniqueConstraintError(error)) continue;
      throw error;
    }
  }
  return { ok: false, status: 409, code: "NUMBERING_CONFLICT", message: "Could not allocate an invoice number. Try again." };
}

