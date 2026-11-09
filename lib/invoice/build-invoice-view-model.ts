import { nonGstDocument } from "@/lib/msme/threshold";
import type { InvoiceTotals } from "@/lib/invoice/totals";
import { canUsePaymentGateways } from "@/lib/entitlements";
import { resolvePrimaryRemittanceFromProfile } from "@/lib/banking/resolve-primary-remittance";
import type { NormalizedPrimaryRemittanceAccount } from "@/lib/banking/types";
import { normalizeInvoiceWatermark, type InvoiceWatermarkKind } from "@/lib/invoice-templates/shared/watermark";
import { resolveInvoiceTemplateId } from "@/lib/invoice-templates/registry";

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
}

export interface PDFService {
  title: string;
  nicDetails: string;
  amount: number;
  sacCode?: string | null;
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
}

type InvoiceAddress = {
  full: string;
  lines: string[];
};

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

