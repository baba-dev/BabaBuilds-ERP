import { nonGstDocument } from "@/lib/msme/threshold";
import type { InvoiceTotals } from "@/lib/invoice/totals";
import { canUsePaymentGateways } from "@/lib/entitlements";
import { resolvePrimaryRemittanceFromProfile } from "@/lib/banking/resolve-primary-remittance";
import type { NormalizedPrimaryRemittanceAccount } from "@/lib/banking/types";
import { normalizeInvoiceWatermark, type InvoiceWatermarkKind } from "@/lib/invoice-templates/shared/watermark";
import { resolveInvoiceTemplateId } from "@/lib/invoice-templates/registry";
import { buildGstBreakdown, type GstBreakdown, type GstInput } from "@/lib/invoice/gst-breakdown";
import { amountInWords } from "@/lib/invoice-templates/shared/words";
import { normalizeHexColor } from "@/lib/invoice-templates/shared/accent-color";

export interface PDFProfile {
  companyName: string;
  proprietorName?: string | null;
  address: string;
  taxIdLabel?: string | null;
  routingLabel?: string | null;
  logoUrl?: string | null;
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  udyamNumber?: string | null;
  gstRegistrationType?: string | null;
  panNumber?: string | null;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifscCode: string;
  primaryBankAccount?: {
    bankName?: string | null;
    accountHolderName?: string | null;
    maskedAccountNumber?: string | null;
    routingCode?: string | null;
  } | null;
  signatureUrl?: string | null;
  invoiceTheme?: string | null;
  /** Workspace default brand colour, #RRGGBB. */
  invoiceAccentColor?: string | null;
  /** Supplier GST state code (2 digits). */
  gstStateCode?: string | null;
  taxLabel?: string | null;
  workspace?: {
    planTier: string;
    subscriptionStatus?: string | null;
    subscriptionEndsAt?: Date | string | null;
    countryCode?: string | null;
    baseCurrency?: string | null;
  } | null;
}

export interface PDFClient {
  name: string;
  address: string;
  country: string;
  email?: string | null;
  taxId?: string | null;
  isExport: boolean;
  logoUrl?: string | null;
  /** Per-client brand colour override, #RRGGBB. */
  invoiceAccentColor?: string | null;
  gstStateCode?: string | null;
}

export interface PDFService {
  title: string;
  nicDetails: string;
  amount: number;
  sacCode?: string | null;
}

export interface PDFLine {
  description: string;
  note?: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  /** Fraction, e.g. 0.18. Falls back to the invoice's tax rate when absent. */
  taxRate?: number | null;
  sacCode?: string | null;
  /** The line's taxable value (after discount), the figure the invoice totals add up. */
  amount: number;
  section?: string | null;
}

export interface PDFParams {
  profile: PDFProfile;
  client: PDFClient;
  invoiceNumber: string;
  date: Date;
  dueDate: Date;
  billingMonth: string;
  sacCode: string | { code?: string | null; value?: string | null; label?: string | null } | null;
  services: PDFService[];
  totals: InvoiceTotals;
  formattedTotal: string;
  baseCurrency: string;
  userLocale: string;
  paymentLink?: string | null;
  status?: string | null;
  showFreePlanFooter?: boolean;
  templateId?: string | null;
  /** Detailed line items. When absent the lines are derived from `services` (quantity 1). */
  lines?: PDFLine[];
  /** GST treatment: place of supply, reverse charge, SEZ, e-invoice IRN. */
  gst?: GstInput;
  /** Per-invoice brand colour override, #RRGGBB. */
  accentColor?: string | null;
  /** Payment details for the PAID / PARTIAL stamp. An unknown paid amount is treated as nothing paid. */
  payment?: { paidOn?: Date | null; amountPaid?: number };
}

type InvoiceAddress = {
  full: string;
  lines: string[];
};

export type InvoiceLineView = {
  description: string;
  note: string | null;
  quantity: number;
  quantityFormatted: string;
  unitPrice: number;
  unitPriceFormatted: string;
  discountAmount: number;
  taxRatePercent: number;
  sacCode: string | null;
  amount: number;
  amountFormatted: string;
  section: string | null;
};

export type InvoicePaymentView = {
  kind: "NONE" | "PARTIAL" | "PAID";
  paidOn: Date | null;
  amountPaid: number;
  balanceDue: number;
};

export type InvoiceQrSource = { kind: "PAYMENT_LINK"; url: string; label: string };

type InvoiceServiceView = {
  title: string;
  titleClamped: string;
  nicDetails: string;
  amount: number;
  amountFormatted: string;
  sacCodeDisplay?: string;
};

export interface InvoiceViewModel {
  profile: PDFProfile;
  clientRaw: PDFClient;
  invoiceNumber: string;
  date: Date;
  dueDate: Date;
  billingMonth: string;
  services: InvoiceServiceView[];
  lines: InvoiceLineView[];
  gst: GstBreakdown;
  /** Normalised accent colours by level; a template resolves them with its own default. */
  accentCandidates: { invoice: string | null; client: string | null; workspace: string | null };
  payment: InvoicePaymentView;
  amountInWords: string | null;
  paymentQrs: InvoiceQrSource[];
  totals: InvoiceTotals;
  formattedTotal: string;
  baseCurrency: string;
  userLocale: string;
  paymentLink: string | null;
  safeTaxIdLabel: string;
  safeRoutingLabel: string;
  headerTitle: string;
  subHeader: string;
  sacCodeDisplay: string;
  sacCodeShort: string;
  profileAddress: InvoiceAddress;
  clientAddress: InvoiceAddress;
  remittance: NormalizedPrimaryRemittanceAccount;
  remittanceDisplay: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    routingCode: string;
  };
  showFreePlanFooter: boolean;
  taxLabel: string;
  taxRatePercent: number;
  taxRowLabel: string;
  watermarkKind: InvoiceWatermarkKind;
  workspaceCountryCode: string;
  isIndiaWorkspace: boolean;
  template: {
    requestedTemplateId?: string | null;
    resolvedTemplateId: string;
  };
  flags: {
    hasLogo: boolean;
    hasClientLogo: boolean;
    hasSignature: boolean;
    hasBankDetails: boolean;
    showPaymentLink: boolean;
    isExportInvoice: boolean;
    isTaxExempt: boolean;
    hasMixedTaxRates: boolean;
  };
}

const DEFAULT_TEXT = "Not configured";

const sanitizeDisplayText = (value: string | null | undefined): string => (typeof value === "string" ? value.trim() : "");

const splitAddress = (value: string | null | undefined): InvoiceAddress => {
  const full = typeof value === "string" ? value.trim() : "";
  if (!full) return { full: "", lines: [] };
  const parts = full.split(", ").filter(Boolean);
  if (parts.length <= 1) return { full, lines: [sanitizeDisplayText(full)] };
  const mid = Math.ceil(parts.length / 2);
  const line1 = sanitizeDisplayText(parts.slice(0, mid).join(", "));
  const line2 = sanitizeDisplayText(parts.slice(mid).join(", "));
  return { full, lines: [line1, line2].filter(Boolean) };
};

const resolveSacCodeDisplay = (sacCode: PDFParams["sacCode"]): string => {
  let displaySac: string | undefined = typeof sacCode === "string" ? sacCode : undefined;
  if (typeof sacCode === "object" && sacCode !== null) {
    displaySac = sacCode.code || sacCode.value || sacCode.label || JSON.stringify(sacCode);
  }
  return displaySac || "N/A";
};

const hasMeaningfulBankValue = (value: string | null | undefined) => Boolean(value && value.trim() && value !== DEFAULT_TEXT);

const buildBankDisplay = (remittance: NormalizedPrimaryRemittanceAccount) => {
  const bankName = remittance.bankName || DEFAULT_TEXT;
  const accountName = remittance.accountHolderName || DEFAULT_TEXT;
  const accountNumber = remittance.accountNumberDisplay || remittance.maskedAccountNumber || DEFAULT_TEXT;
  const routingCode = remittance.routingCode || DEFAULT_TEXT;
  const hasBankDetails = [bankName, accountName, accountNumber, routingCode].some(hasMeaningfulBankValue);

  return {
    remittanceDisplay: {
      bankName,
      accountName,
      accountNumber,
      routingCode,
    },
    hasBankDetails,
  };
};

export const buildInvoiceViewModel = ({
  profile,
  client,
  invoiceNumber,
  date,
  dueDate,
  billingMonth,
  sacCode,
  services,
  totals,
  formattedTotal,
  baseCurrency,
  userLocale,
  paymentLink,
  status,
  showFreePlanFooter: showFreePlanFooterArg,
  templateId,
  lines: linesArg,
  gst: gstArg,
  accentColor,
  payment: paymentArg,
}: PDFParams): InvoiceViewModel => {
  const billingSnapshot = {
    planTier: profile.workspace?.planTier,
    subscriptionStatus: profile.workspace?.subscriptionStatus,
    subscriptionEndsAt: profile.workspace?.subscriptionEndsAt,
  };

  const showFreePlanFooter =
    showFreePlanFooterArg !== undefined
      ? showFreePlanFooterArg
      : !canUsePaymentGateways(billingSnapshot);

  const safeTaxIdLabel = profile.taxIdLabel || "VAT/GST Number";
  const safeRoutingLabel = profile.routingLabel || "IFSC Code";
  // Unregistered and composition-scheme suppliers cannot issue a tax invoice.
  const nonGst = client.isExport ? null : nonGstDocument(profile, profile.workspace?.countryCode);
  const headerTitle = client.isExport ? "EXPORT OF SERVICES" : (nonGst?.title ?? "TAX INVOICE");
  const subHeader = client.isExport ? "ZERO RATED SUPPLY" : (nonGst?.note ?? "DOMESTIC SUPPLY");
  const taxLabel = profile.taxLabel || "Tax";
  const taxRatePercent = Math.round(totals.taxRate * 100);
  let taxRowLabel = `${taxLabel} (${taxRatePercent}%)`;
  if (totals.taxMode === "exempt") taxRowLabel = `${taxLabel} (Exempt 0%)`;
  if (totals.taxMode === "mixed") taxRowLabel = `${taxLabel} (Mixed rates)`;

  const remittance = resolvePrimaryRemittanceFromProfile(profile);
  const { remittanceDisplay, hasBankDetails } = buildBankDisplay(remittance);
  const sacCodeDisplay = resolveSacCodeDisplay(sacCode);
  const sacCodeShort = sacCodeDisplay.length > 25 ? `${sacCodeDisplay.slice(0, 22)}...` : sacCodeDisplay;
  const normalizedPaymentLink = typeof paymentLink === "string" && paymentLink.trim() ? paymentLink.trim() : null;
  const watermarkKind = normalizeInvoiceWatermark(status);
  const workspaceCountryCode = profile.workspace?.countryCode?.trim().toUpperCase() || "IN";
  const isIndiaWorkspace = workspaceCountryCode === "IN";
  const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const defaultLineRate = totals.taxMode === "exempt" ? 0 : totals.taxRate;
  const sourceLines: PDFLine[] =
    linesArg ??
    services.map((s) => ({ description: s.title, note: s.nicDetails || null, quantity: 1, unitPrice: s.amount, amount: s.amount, sacCode: s.sacCode ?? null }));
  const lines: InvoiceLineView[] = sourceLines.map((l) => {
    const sac = resolveSacCodeDisplay(l.sacCode || null);
    const rate = totals.taxMode === "exempt" ? 0 : (l.taxRate ?? defaultLineRate);
    return {
      description: sanitizeDisplayText(l.description),
      note: sanitizeDisplayText(l.note) || null,
      quantity: l.quantity,
      quantityFormatted: l.quantity.toLocaleString(userLocale, { maximumFractionDigits: 3 }),
      unitPrice: l.unitPrice,
      unitPriceFormatted: l.unitPrice.toLocaleString(userLocale, { minimumFractionDigits: 2 }),
      discountAmount: l.discountAmount ?? 0,
      taxRatePercent: Math.round(rate * 10_000) / 100,
      sacCode: sac !== "N/A" ? sac : null,
      amount: l.amount,
      amountFormatted: l.amount.toLocaleString(userLocale, { minimumFractionDigits: 2 }),
      section: sanitizeDisplayText(l.section) || null,
    };
  });
  const gst = buildGstBreakdown({
    lines: lines.map((l) => ({ amount: l.amount, taxRate: l.taxRatePercent / 100 })),
    gst: gstArg ? { ...gstArg, supplierStateCode: gstArg.supplierStateCode ?? profile.gstStateCode ?? null } : undefined,
    isExport: Boolean(client.isExport),
    isTaxExempt: totals.taxMode === "exempt",
    totalTaxAmount: totals.taxAmount,
  });
  const amountPaid = watermarkKind === "PAID" ? (paymentArg?.amountPaid ?? totals.total) : watermarkKind === "PARTIAL" ? (paymentArg?.amountPaid ?? 0) : 0;
  const payment: InvoicePaymentView = {
    kind: watermarkKind === "NONE" ? "NONE" : watermarkKind,
    paidOn: paymentArg?.paidOn ?? null,
    amountPaid,
    balanceDue: Math.max(0, roundMoney(totals.total - amountPaid)),
  };
  const resolvedTemplateId = resolveInvoiceTemplateId({
    requestedTemplateId: templateId,
    profileTheme: profile.invoiceTheme,
    fallbackId: "DESIGN_1",
  });

  return {
    profile,
    clientRaw: client,
    invoiceNumber,
    date,
    dueDate,
    billingMonth: sanitizeDisplayText(billingMonth),
    services: services.map((service) => {
      const sacDisplay = resolveSacCodeDisplay(service.sacCode || null);
      return {
        title: service.title,
        titleClamped: sanitizeDisplayText(service.title),
        nicDetails: service.nicDetails || "",
        amount: service.amount,
        amountFormatted: service.amount.toLocaleString(userLocale, { minimumFractionDigits: 2 }),
        sacCodeDisplay: sacDisplay !== "N/A" ? sacDisplay : undefined,
      };
    }),
    lines,
    gst,
    accentCandidates: {
      invoice: normalizeHexColor(accentColor),
      client: normalizeHexColor(client.invoiceAccentColor),
      workspace: normalizeHexColor(profile.invoiceAccentColor),
    },
    payment,
    amountInWords: amountInWords(totals.total, baseCurrency),
    paymentQrs: normalizedPaymentLink ? [{ kind: "PAYMENT_LINK", url: normalizedPaymentLink, label: "Pay online" }] : [],
    totals,
    formattedTotal,
    baseCurrency,
    userLocale,
    paymentLink: normalizedPaymentLink,
    safeTaxIdLabel,
    safeRoutingLabel,
    headerTitle,
    subHeader,
    sacCodeDisplay,
    sacCodeShort,
    profileAddress: splitAddress(profile.address),
    clientAddress: splitAddress(client.address),
    remittance,
    remittanceDisplay,
    showFreePlanFooter,
    taxLabel,
    taxRatePercent,
    taxRowLabel,
    watermarkKind,
    workspaceCountryCode,
    isIndiaWorkspace,
    template: {
      requestedTemplateId: templateId,
      resolvedTemplateId,
    },
    flags: {
      hasLogo: Boolean(profile.logoUrl),
      hasClientLogo: Boolean(client.logoUrl),
      hasSignature: Boolean(profile.signatureUrl),
      hasBankDetails,
      showPaymentLink: Boolean(normalizedPaymentLink),
      isExportInvoice: Boolean(client.isExport),
      isTaxExempt: totals.taxMode === "exempt",
      hasMixedTaxRates: totals.taxMode === "mixed",
    },
  };
};

