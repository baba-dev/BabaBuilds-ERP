import "server-only";
import { prisma } from "@/lib/prisma";
import { effectiveTotal } from "@/lib/invoices/serialize";
import type { PDFParams, PDFProfile } from "@/lib/invoice/build-invoice-view-model";
import { loadPaymentQrImages } from "@/lib/invoice/payment-qr-loader";
import { designUsesPaymentQrs, toPdfPaymentQrs } from "@/lib/invoice/pdf-params";
import { mapInvoiceToParams, type PreviewInvoiceRow } from "@/lib/invoice/preview-params";
import { loadClientStatement } from "@/lib/invoice/statement-loader";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";

export type PreviewSource = {
  params: PDFParams;
  /** The invoice being shown, or null for the sample. */
  invoice: { id: string; number: string; clientName: string; date: Date } | null;
  isSample: boolean;
};

/**
 * Loads what a design preview needs. Reads only; never creates a payment link or writes a file. An invoice id that is
 * not in this workspace gives null. With no invoices (or no business profile yet) a labelled sample is returned,
 * wearing the workspace's own business details when it has them.
 */
export async function loadPreviewParams(args: { workspaceId: string; invoiceId: string | null; design: string }): Promise<PreviewSource | null> {
  const { workspaceId, invoiceId, design } = args;

  const profileRow = await prisma.businessProfile.findUnique({
    where: { workspaceId },
    include: {
      workspace: { select: { planTier: true, subscriptionStatus: true, subscriptionEndsAt: true, countryCode: true, baseCurrency: true } },
      primaryBankAccount: true,
    },
  });
  const profile = (profileRow ?? SAMPLE_INVOICES.basic.profile) as unknown as PDFProfile;
  const qr: Partial<ReturnType<typeof toPdfPaymentQrs>> = designUsesPaymentQrs(design) && profileRow ? toPdfPaymentQrs(profileRow, await loadPaymentQrImages(workspaceId)) : {};

  const row = profileRow
    ? await prisma.invoice.findFirst({
        where: invoiceId ? { id: invoiceId, workspaceId } : { workspaceId, status: { not: "VOID" } },
        orderBy: { invoiceDate: "desc" },
        include: {
          items: true,
          payments: { select: { amount: true, receivedAt: true, reversedAt: true } },
          client: { select: { name: true, address: true, country: true, email: true, taxId: true, isExport: true, logoUrl: true, invoiceAccentColor: true, gstStateCode: true } },
        },
      })
    : null;

  if (invoiceId && !row) return null;

  if (!row) {
    return { params: { ...SAMPLE_INVOICES.gstIntra, profile, upi: qr.upi, staticQrs: qr.staticQrs }, invoice: null, isSample: true };
  }

  const plain: PreviewInvoiceRow = {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    billingMonth: row.billingMonth,
    clientName: row.clientName,
    sacCode: row.sacCode,
    status: row.status,
    currency: row.currency,
    subtotal: row.subtotal.toNumber(),
    taxRate: row.taxRate,
    taxAmount: row.taxAmount.toNumber(),
    total: effectiveTotal(row).toNumber(),
    taxMode: row.taxMode,
    gstPlaceOfSupply: row.gstPlaceOfSupply,
    gstReverseCharge: row.gstReverseCharge,
    gstSupplyOverride: row.gstSupplyOverride,
    irn: row.irn,
    irnAckNo: row.irnAckNo,
    irnAckDate: row.irnAckDate,
    accentColor: row.accentColor,
    tdsSection: row.tdsSection,
    tdsRatePercent: row.tdsRatePercent,
    tdsAmount: row.tdsAmount ? row.tdsAmount.toNumber() : null,
    items: row.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice.toNumber(), taxRate: i.taxRate, sacCode: i.sacCode, totalAmount: i.totalAmount.toNumber() })),
    payments: row.payments.map((p) => ({ amount: p.amount.toNumber(), receivedAt: p.receivedAt, reversedAt: p.reversedAt })),
    client: row.client,
  };

  const statement = design === "DESIGN_6" && row.clientId ? await loadClientStatement(workspaceId, row.clientId, row.invoiceDate, row.currency) : undefined;
  return {
    params: mapInvoiceToParams(plain, { profile, statement, upi: qr.upi, staticQrs: qr.staticQrs }),
    invoice: { id: row.id, number: row.invoiceNumber, clientName: row.clientName, date: row.invoiceDate },
    isSample: false,
  };
}
