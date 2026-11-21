import type { PDFClient, PDFLine, PDFParams, PDFProfile } from "@/lib/invoice/build-invoice-view-model";
import type { StatementInput } from "@/lib/invoice/statement";
import { computeTds, normalizeTdsSection } from "@/lib/invoice/tds";
import { normalizeHexColor } from "@/lib/invoice-templates/shared/accent-color";

/** A stored invoice as plain data (numbers, not Decimals), everything the renderer needs. */
export type PreviewInvoiceRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  billingMonth: string;
  clientName: string;
  sacCode: string | null;
  status: string;
  currency: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  taxMode: string;
  gstPlaceOfSupply: string | null;
  gstReverseCharge: boolean;
  gstSupplyOverride: string | null;
  irn: string | null;
  irnAckNo: string | null;
  irnAckDate: Date | null;
  accentColor: string | null;
  tdsSection: string | null;
  tdsRatePercent: number | null;
  tdsAmount: number | null;
  items: Array<{ description: string; quantity: number; unitPrice: number; taxRate: number; sacCode: string | null; totalAmount: number }>;
  payments: Array<{ amount: number; receivedAt: Date; reversedAt: Date | null }>;
  client: (Pick<PDFClient, "name" | "address" | "country" | "email" | "taxId" | "isExport" | "logoUrl" | "invoiceAccentColor" | "gstStateCode">) | null;
};

type Extras = {
  profile: PDFProfile;
  upi?: PDFParams["upi"];
  staticQrs?: PDFParams["staticQrs"];
  statement?: StatementInput;
};

const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Item rates are stored as fractions (0.18); tolerate a percent-style value (18). */
const asFraction = (rate: number) => (rate > 1 ? rate / 100 : rate);

/**
 * Turns a stored invoice into the same `PDFParams` the generator uses, so a preview is rendered by the real
 * templates. Pure: no payment link is created or carried (previews never touch payments).
 */
export const mapInvoiceToParams = (row: PreviewInvoiceRow, extras: Extras): PDFParams => {
  const locale = row.currency === "INR" ? "en-IN" : "en-US";
  const lines: PDFLine[] = row.items.map((i) => ({
    description: i.description,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    amount: i.totalAmount,
    taxRate: asFraction(i.taxRate),
    sacCode: i.sacCode,
  }));
  const rates = new Set(lines.map((l) => l.taxRate));
  const taxMode = row.taxMode === "exempt" ? "exempt" : rates.size > 1 ? "mixed" : "taxable";
  const received = row.payments.filter((p) => !p.reversedAt);
  const amountPaid = round2(received.reduce((sum, p) => sum + p.amount, 0));
  const lastPayment = received.length ? new Date(Math.max(...received.map((p) => p.receivedAt.getTime()))) : null;

  const client: PDFClient = row.client
    ? { ...row.client }
    : { name: row.clientName, address: "", country: "", email: null, taxId: null, isExport: false, logoUrl: null };

  return {
    profile: extras.profile,
    client,
    invoiceNumber: row.invoiceNumber,
    date: row.invoiceDate,
    dueDate: row.dueDate ?? new Date(row.invoiceDate.getTime() + 7 * DAY_MS),
    billingMonth: row.billingMonth,
    sacCode: row.sacCode,
    services: row.items.map((i) => ({ title: i.description, nicDetails: "", amount: i.totalAmount, sacCode: i.sacCode })),
    totals: { subtotal: row.subtotal, taxRate: row.taxRate, taxAmount: row.taxAmount, total: row.total, taxMode },
    formattedTotal: row.total.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    baseCurrency: row.currency,
    userLocale: locale,
    paymentLink: null,
    status: row.status,
    lines,
    gst: {
      placeOfSupply: row.gstPlaceOfSupply,
      reverseCharge: row.gstReverseCharge,
      supplyOverride: row.gstSupplyOverride,
      irn: row.irn,
      irnAckNo: row.irnAckNo,
      irnAckDate: row.irnAckDate,
    },
    accentColor: row.accentColor,
    payment: { paidOn: lastPayment, amountPaid: amountPaid > 0 ? amountPaid : undefined },
    tds: row.tdsAmount && row.tdsAmount > 0 && row.tdsRatePercent ? { section: row.tdsSection, ratePercent: row.tdsRatePercent, amount: row.tdsAmount } : null,
    statement: extras.statement,
    upi: extras.upi,
    staticQrs: extras.staticQrs,
  };
};

/**
 * Applies what a preview request may change: the design, an accent colour and expected TDS. Everything is normalised
 * or clamped; junk is ignored (accent) or switches TDS off. Returns a new object.
 */
export const applyPreviewOverrides = (
  params: PDFParams,
  overrides: { design: string; accent?: unknown; tdsRatePercent?: unknown; tdsSection?: unknown },
): PDFParams => {
  const next: PDFParams = { ...params, templateId: overrides.design };
  const accent = normalizeHexColor(overrides.accent);
  if (accent) next.accentColor = accent;

  if (overrides.tdsRatePercent !== undefined) {
    const raw = overrides.tdsRatePercent;
    const rate = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
    const result = computeTds({ subtotal: params.totals.subtotal, ratePercent: rate, isExport: Boolean(params.client.isExport) });
    next.tds = result ? { section: normalizeTdsSection(overrides.tdsSection)?.toUpperCase() ?? null, ratePercent: result.ratePercent, amount: result.amount } : null;
  }
  return next;
};
