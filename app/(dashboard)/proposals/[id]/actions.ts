"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createProposalConversion } from "@/lib/commercial-workflow/proposal-conversion";
import { toDecimal } from "@/lib/money";
import { calculateInvoiceTotals } from "@/lib/invoice/totals";
import { resolveTaxRate } from "@/lib/invoice/tax-resolver";
import { buildPrivatePath, ensureDir } from "@/lib/uploads/private-storage";
import { generateInvoicePDF } from "@/lib/pdf/generator";
import fs from "fs";
import { decrypt } from "@/lib/encryption";
import { generateTenantPaymentLink } from "@/lib/razorpay-links";
import { generateStripePaymentLink } from "@/lib/stripe-links";
import {
  assertFreeTierMonthlyInvoiceAllowed,
  canInjectGatewayPaymentLinks,
} from "@/lib/entitlements";
import { getNextInvoiceNumber } from "@/lib/document-numbering";

export async function convertProposalToInvoiceAction(proposalId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.workspaceId) redirect("/login");

  const workspaceId = session.workspaceId;
  const actorUserId = session.user?.id ?? null;

  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, workspaceId },
    include: {
      client: true,
      items: true,
      workspace: { select: { planTier: true, subscriptionStatus: true, subscriptionEndsAt: true } },
    },
  });
  if (!proposal) redirect("/proposals");

  // Idempotency: if already converted to an invoice, just bounce back.
  const existingInvoice = await prisma.invoice.findFirst({
    where: { workspaceId, sourceProposalId: proposal.id },
    orderBy: { createdAt: "desc" },
  });
  if (existingInvoice) {
    revalidatePath(`/proposals/${proposal.id}`);
    redirect(`/income?search=${encodeURIComponent(existingInvoice.invoiceNumber)}`);
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { workspaceId },
    include: { workspace: true },
  });
  if (!profile) {
    // Cannot generate invoice without business profile configuration.
    redirect(`/proposals/${proposal.id}`);
  }

  const invoiceDate = new Date();
  const limitErr = await assertFreeTierMonthlyInvoiceAllowed(workspaceId, invoiceDate);
  if (limitErr) {
    redirect(`/proposals/${proposalId}?billing=free_invoice_month`);
  }

  const baseCurrency = profile.workspace?.baseCurrency || "INR";
  const countryCode = profile.workspace?.countryCode || "IN";

  const services = proposal.items.map((item) => {
    const amount = Number(item.total);
    return {
      title: item.title,
      nicDetails: "",
      amount,
    };
  });

  const taxResolution = resolveTaxRate({
    countryCode,
    isTaxExempt: Boolean(proposal.client.isExport),
    serviceTaxRates: [],
    workspaceDefaultTaxRate: profile.defaultTaxRate,
    taxRateOverride: undefined,
  });

  // If tax requires user input, fall back to stored proposal totals rather than blocking conversion.
  const totals = taxResolution.requiresUserInput
    ? {
        subtotal: Number(proposal.subtotal),
        taxRate: 0,
        taxAmount: Number(proposal.estimatedTax),
        total: Number(proposal.totalAmount),
        taxMode: "exempt" as const,
      }
    : calculateInvoiceTotals({
        // `calculateInvoiceTotals` expects the richer invoice "service" shape (quantity/unitPrice/etc).
        // For proposal conversion, reuse proposal line totals directly.
        services: proposal.items.map((item) => ({
          title: item.title,
          amount: Number(item.total),
          quantity: Number(item.quantity ?? 1),
          unitPrice: Number(item.unitPrice),
          amountDecimal: toDecimal(Number(item.total)).toDecimalPlaces(2),
        })),
        isTaxExempt: Boolean(proposal.client.isExport),
        defaultTaxRate: taxResolution.taxRate,
      });

  const dueDate = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + 7);

  // Invoice numbering mirrors the existing generator route's FY logic (simplified).
  const currentMonth = invoiceDate.getMonth() + 1;
  const currentYear = invoiceDate.getFullYear();
  const shortYear = currentYear.toString().slice(-2);
  const fy =
    currentMonth <= 3
      ? `${parseInt(shortYear) - 1}-${shortYear}`
      : `${shortYear}-${parseInt(shortYear) + 1}`;

  const { invoiceNumber } = await getNextInvoiceNumber(prisma, workspaceId, invoiceDate, profile.invoicePrefix || "INV");

  // Generate payment link if possible (best-effort; never blocks conversion).
  const billingSnap = {
    planTier: proposal.workspace?.planTier,
    subscriptionStatus: proposal.workspace?.subscriptionStatus,
    subscriptionEndsAt: proposal.workspace?.subscriptionEndsAt,
  };
  const paidFeatures = canInjectGatewayPaymentLinks(billingSnap);
  const defaultGateway = String(profile.defaultGateway || "RAZORPAY").toUpperCase();
  let paymentLink: string | null = null;
  let providerPaymentLinkId: string | null = null;
  let providerGateway: string | null = null;

  if (paidFeatures) {
    if (
      defaultGateway === "RAZORPAY" &&
      baseCurrency === "INR" &&
      profile.razorpayKeyId &&
      profile.razorpayKeySecret
    ) {
      const decryptedSecret = decrypt(profile.razorpayKeySecret);
      const result = await generateTenantPaymentLink({
        amount: Number(totals.total),
        currency: baseCurrency,
        description: `Invoice ${invoiceNumber}`,
        invoiceDueDate: dueDate,
        customerDetails: {
          name: proposal.client.name,
          email: proposal.client.email ?? undefined,
        },
        tenantKeyId: profile.razorpayKeyId,
        tenantKeySecret: decryptedSecret,
      });
      if (result) {
        paymentLink = result.url;
        providerPaymentLinkId = result.linkId;
        providerGateway = "RAZORPAY";
      }
    }

    if (
      !paymentLink &&
      defaultGateway === "STRIPE" &&
      profile.stripeSecretKey
    ) {
      const decryptedSecret = decrypt(profile.stripeSecretKey);
      const result = await generateStripePaymentLink({
        amount: Number(totals.total),
        currency: baseCurrency,
        description: `Invoice ${invoiceNumber}`,
        invoiceNumber,
        tenantSecretKey: decryptedSecret,
      });
      if (result) {
        paymentLink = result.url;
        providerPaymentLinkId = result.linkId;
        providerGateway = "STRIPE";
      }
    }
  }

  // Generate PDF (private storage) and then create invoice.
  const invoicesDir = buildPrivatePath("invoices", [workspaceId]);
  await ensureDir(invoicesDir);
  const pdfFilename = `${invoiceNumber.replace(/\//g, "_")}.pdf`;
  const pdfPath = buildPrivatePath("invoices", [workspaceId, pdfFilename]);
  const relativePdfPath = `/invoices/${workspaceId}/${pdfFilename}`;

  const formattedTotal = Number(totals.total).toLocaleString(
    countryCode === "IN" ? "en-IN" : "en-US",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );

  const pdfBytes = await generateInvoicePDF({
    profile,
    client: proposal.client,
    invoiceNumber,
    date: invoiceDate,
    dueDate,
    billingMonth: invoiceDate.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    sacCode: "",
    services,
    totals,
    formattedTotal,
    baseCurrency,
    userLocale: countryCode === "IN" ? "en-IN" : "en-US",
    paymentLink,
    status: "PENDING",
  });

  await fs.promises.writeFile(pdfPath, pdfBytes, { mode: 0o600 });

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        workspaceId,
        invoiceNumber,
        financialYear: fy,
        billingMonth: invoiceDate.toLocaleString("en-IN", { month: "long", year: "numeric" }),
        invoiceDate,
        dueDate,
        clientName: proposal.client.name,
        clientId: proposal.clientId,
        sacCode: null,
        serviceDescription: proposal.title,
        subtotal: toDecimal(totals.subtotal).toDecimalPlaces(2),
        taxRate: totals.taxRate,
        taxAmount: toDecimal(totals.taxAmount).toDecimalPlaces(2),
        grandTotal: toDecimal(totals.total).toDecimalPlaces(2),
        taxMode: totals.taxMode,
        totalAmount: toDecimal(totals.total).toDecimalPlaces(2),
        pdfPath: relativePdfPath,
        status: "PENDING",
        currency: baseCurrency,
        baseGrandTotal: toDecimal(totals.total).toDecimalPlaces(2),
        source: "PROPOSAL",
        sourceProposalId: proposal.id,
        providerGateway,
        providerPaymentLinkId,
        items: {
          create: proposal.items.map((i) => ({
            productId: null,
            description: i.title,
            quantity: i.quantity || 1,
            unitPrice: toDecimal(Number(i.unitPrice)).toDecimalPlaces(2),
            taxRate: taxResolution.requiresUserInput ? 0 : taxResolution.taxRate,
            totalAmount: toDecimal(Number(i.total)).toDecimalPlaces(2),
          })),
        },
      },
    });

    await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        firstConvertedAt: proposal.firstConvertedAt || new Date(),
        // Keep the original funnel statuses but mark as invoiced for downstream reporting.
        status: "INVOICED",
      },
    });

    return created;
  });

  await createProposalConversion({
    workspaceId,
    proposalId: proposal.id,
    conversionType: "ONE_TIME_INVOICE",
    actorUserId,
    invoiceId: invoice.id,
  });

  revalidatePath(`/proposals/${proposal.id}`);
  redirect(`/income?search=${encodeURIComponent(invoice.invoiceNumber)}`);
}

export async function convertAcceptedProposalToInvoiceAction(formData: FormData) {
  const proposalId = String(formData.get("proposalId") || "");
  if (!proposalId) redirect("/proposals");
  return convertProposalToInvoiceAction(proposalId);
}

export async function convertProposalToInvoiceFormAction(formData: FormData) {
  return convertAcceptedProposalToInvoiceAction(formData);
}

export async function convertProposalToRetainerAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.workspaceId) redirect("/login");

  const workspaceId = session.workspaceId;
  const actorUserId = session.user?.id ?? null;

  const proposalId = String(formData.get("proposalId") || "");
  const frequency = String(formData.get("frequency") || "MONTHLY").toUpperCase();
  const amountRaw = String(formData.get("amount") || "");
  const amount = Number(amountRaw);
  const serviceName = String(formData.get("serviceName") || "").trim();

  if (!proposalId) redirect("/proposals");

  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, workspaceId },
    include: { client: true },
  });
  if (!proposal) redirect("/proposals");

  // Basic guards
  if (!Number.isFinite(amount) || amount <= 0) redirect(`/proposals/${proposal.id}`);
  const freq = ["MONTHLY", "QUARTERLY", "ANNUALLY"].includes(frequency)
    ? frequency
    : "MONTHLY";

  // Idempotency: only one retainer conversion per proposal (for now).
  const existing = await prisma.retainer.findFirst({
    where: { workspaceId, sourceProposalId: proposal.id },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    revalidatePath(`/proposals/${proposal.id}`);
    redirect(`/retainers`);
  }

  const nextBillingDate = new Date();
  if (freq === "MONTHLY") nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
  if (freq === "QUARTERLY") nextBillingDate.setMonth(nextBillingDate.getMonth() + 3);
  if (freq === "ANNUALLY") nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);

  const retainer = await prisma.$transaction(async (tx) => {
    const created = await tx.retainer.create({
      data: {
        workspaceId,
        clientId: proposal.clientId,
        amount: toDecimal(amount).toDecimalPlaces(2),
        frequency: freq,
        status: "ACTIVE",
        nextBillingDate,
        autoAppendMonth: true,
        serviceName: serviceName || proposal.title,
        sacCode: null,
        sourceProposalId: proposal.id,
      },
    });

    await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        firstConvertedAt: proposal.firstConvertedAt || new Date(),
        status: "INVOICED",
      },
    });

    return created;
  });

  await createProposalConversion({
    workspaceId,
    proposalId: proposal.id,
    conversionType: "RETAINER",
    actorUserId,
    retainerId: retainer.id,
  });

  revalidatePath(`/proposals/${proposal.id}`);
  redirect(`/retainers`);
}

export async function convertProposalToRetainerFormAction(formData: FormData) {
  return convertProposalToRetainerAction(formData);
}


