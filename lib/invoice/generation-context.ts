import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateInvoiceTotals } from "@/lib/invoice/totals";
import { resolveTaxRate } from "@/lib/invoice/tax-resolver";
import { toInvoiceStatus } from "@/lib/invoice-status";
import { toDecimal } from "@/lib/money";
import {
  assertFreeTierMonthlyInvoiceAllowed,
  canInjectGatewayPaymentLinks,
  type WorkspaceBillingSnapshot,
} from "@/lib/entitlements";
import { supplierChargesGst } from "@/lib/msme/threshold";

export type ServiceInput = {
  title?: string;
  amount?: number | string;
  productId?: string | null;
  quantity?: number;
  unitPrice?: number | string;
  sac?: string | number | { igstRate?: number | null } | null;
  taxRate?: number | null;
  sacCode?: string | null;
};

export type SanitizedService = ServiceInput & {
  title: string;
  amount: number;
  amountDecimal: Prisma.Decimal;
  nicDetails: string;
};

type ProfileSettings = {
  defaultTaxRate?: number | null;
  invoiceTheme?: string | null;
  defaultGateway?: string | null;
  razorpayKeyId?: string | null;
  razorpayKeySecret?: string | null;
  stripePublishableKey?: string | null;
  stripeSecretKey?: string | null;
};

export type InvoiceGenerationInput = {
  clientId?: string;
  billingMonth?: string;
  sacCode?: string;
  services?: ServiceInput[];
  customDate?: string;
  sendEmail?: boolean;
  status?: string;
  taxRateOverride?: number;
  /** ISO-4217 invoice currency; defaults to the workspace base currency. */
  currency?: string;
  /** Base-currency units per 1 unit of `currency` (required when currency differs from the base currency). */
  exchangeRate?: number | string;
  /** GST treatment picked on the composer (place of supply, SEZ, reverse charge). */
  gst?: { placeOfSupply?: string | null; supplyOverride?: string | null; reverseCharge?: boolean | null };
};

export type InvoiceGenerationContext = {
  workspaceId: string;
  client: Awaited<ReturnType<typeof prisma.client.findFirst>> extends infer T ? NonNullable<T> : never;
  profile: Awaited<ReturnType<typeof prisma.businessProfile.findUnique>> extends infer T ? NonNullable<T> : never;
  profileSettings: ProfileSettings;
  normalizedStatus: ReturnType<typeof toInvoiceStatus>;
  invoiceDate: Date;
  dueDate: Date;
  billingMonthValue: string;
  sanitizedSacCode: string;
  sanitizedServices: SanitizedService[];
  serviceDesc: string;
  validProductIds: Set<string>;
  totals: ReturnType<typeof calculateInvoiceTotals>;
  taxRateOverrideValue?: number;
  taxRate: number;
  countryCode: string;
  userLocale: string;
  /** Currency of THIS invoice (PDF, payment link, email). Named baseCurrency for historical reasons. */
  baseCurrency: string;
  /** Workspace base currency that reports add up in. */
  workspaceBaseCurrency: string;
  /** Base-currency units per 1 unit of baseCurrency (1 when they are the same). */
  exchangeRate: number;
  billingSnapshot: WorkspaceBillingSnapshot;
  paidFeatures: boolean;
  shouldSendEmail: boolean;
};

export class InvoiceValidationError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>, message?: string) {
    super(message ?? String(payload.error ?? "Validation failed"));
    this.status = status;
    this.payload = payload;
  }
}

export async function buildInvoiceGenerationContext(
  workspaceId: string,
  input: InvoiceGenerationInput,
): Promise<InvoiceGenerationContext> {
  const {
    clientId,
    billingMonth,
    sacCode,
    services,
    customDate,
    sendEmail: shouldSendEmail,
    status: rawStatus,
    taxRateOverride,
  } = input;
  const billingMonthValue = typeof billingMonth === "string" ? billingMonth : "";
  const servicesInput: ServiceInput[] = Array.isArray(services) ? services : [];
  const taxRateOverrideValue = typeof taxRateOverride === "number" ? taxRateOverride : undefined;
  const normalizedStatus = toInvoiceStatus(rawStatus);
  const validationErrors: Array<{ field: string; message: string; index?: number }> = [];

  if (!clientId) throw new InvoiceValidationError(400, { error: "No client selected." });
  if (billingMonthValue.trim().length === 0) {
    validationErrors.push({
      field: "billingMonth",
      message: "Billing month is required and must be a non-empty string.",
    });
  }

  let parsedCustomDate: Date | null = null;
  if (typeof customDate !== "undefined" && customDate !== null && customDate !== "") {
    parsedCustomDate = new Date(customDate);
    if (isNaN(parsedCustomDate.getTime())) {
      validationErrors.push({
        field: "customDate",
        message: "Custom date is invalid. Please provide a valid date value.",
      });
    }
  }

  if (servicesInput.length === 0) {
    validationErrors.push({
      field: "services",
      message: "At least one service is required.",
    });
  }

  if (validationErrors.length > 0) {
    throw new InvoiceValidationError(400, { error: "Validation failed", fields: validationErrors });
  }

  const MAX_SERVICE_TITLE_LENGTH = 200;
  const sanitizedServices: SanitizedService[] = servicesInput
    .map((s: ServiceInput, index: number): SanitizedService => {
      const title = typeof s?.title === "string" ? s.title.trim() : "";
      if (!title) {
        validationErrors.push({
          field: "services.title",
          index,
          message: "Service title is required and cannot be empty.",
        });
      } else if (title.length > MAX_SERVICE_TITLE_LENGTH) {
        validationErrors.push({
          field: "services.title",
          index,
          message: `Service title must be ${MAX_SERVICE_TITLE_LENGTH} characters or fewer.`,
        });
      }

      const amt = Number(s?.amount);
      if (!Number.isFinite(amt) || amt < 0) {
        validationErrors.push({
          field: "services.amount",
          index,
          message: "Service amount must be a finite number greater than or equal to 0.",
        });
      }

      return {
        ...s,
        title,
        amount: amt,
        amountDecimal: toDecimal(amt).toDecimalPlaces(2),
        nicDetails: "",
      };
    });

  if (validationErrors.length > 0) {
    throw new InvoiceValidationError(400, { error: "Validation failed", fields: validationErrors });
  }

  const unverifiedProductIds = sanitizedServices
    .map((s: { productId?: string | null }) => s.productId)
    .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
  const validProducts =
    unverifiedProductIds.length > 0
      ? await prisma.product.findMany({ where: { workspaceId, id: { in: unverifiedProductIds } }, select: { id: true, hsnCode: true, gstRate: true } })
      : [];
  const validProductIds = new Set(validProducts.map((p: { id: string }) => p.id));
  // The product master owns HSN and rate: goods lines never inherit the service SAC default.
  const productGst = new Map(validProducts.map((p) => [p.id, p]));
  for (const s of sanitizedServices) {
    const product = typeof s.productId === "string" ? productGst.get(s.productId) : undefined;
    if (!product) continue;
    if (product.hsnCode) s.sacCode = product.hsnCode;
    if (product.gstRate !== null && (s.taxRate === null || s.taxRate === undefined)) s.taxRate = product.gstRate / 100; // services carry fractions; the product master stores percent
  }

  const date = parsedCustomDate ?? new Date();
  if (isNaN(date.getTime())) {
    throw new InvoiceValidationError(400, {
      error: "Validation failed",
      fields: [{ field: "customDate", message: "Custom date is invalid. Please provide a valid date value." }],
    });
  }
  const serviceDesc = sanitizedServices.map((s) => s.title).join(" + ");
  if (!serviceDesc.trim()) {
    throw new InvoiceValidationError(400, {
      error: "Validation failed",
      fields: [{ field: "services.title", message: "At least one service title is required." }],
    });
  }
  if (serviceDesc.length > 2000) {
    throw new InvoiceValidationError(400, {
      error: "Validation failed",
      fields: [{ field: "services", message: "Combined service description is too long for invoice generation." }],
    });
  }

  const sanitizedSacCode = typeof sacCode === "string" ? sacCode.trim() : "";
  if (sanitizedSacCode.length > 100) {
    throw new InvoiceValidationError(400, {
      error: "Validation failed",
      fields: [{ field: "sacCode", message: "SAC code is too long." }],
    });
  }
  if (billingMonthValue.trim().length > 100) {
    throw new InvoiceValidationError(400, {
      error: "Validation failed",
      fields: [{ field: "billingMonth", message: "Billing month is too long." }],
    });
  }

  const client = await prisma.client.findFirst({ where: { id: clientId, workspaceId } });
  if (!client) throw new InvoiceValidationError(404, { error: "Selected client does not exist in your CRM." });

  const profile = await prisma.businessProfile.findUnique({
    where: { workspaceId },
    include: { workspace: true, primaryBankAccount: true },
  });
  if (!profile) throw new InvoiceValidationError(400, { error: "Business profile missing. Please complete Settings Wizard." });

  const countryCode = profile.workspace?.countryCode || "IN";
  const dueDate = new Date(date);
  dueDate.setDate(dueDate.getDate() + (Number.isInteger(profile.invoiceTermsDays) ? profile.invoiceTermsDays : 7));
  const serviceTaxRates = sanitizedServices
    .map((service: SanitizedService) => (typeof service.sac === "object" && service.sac ? service.sac.igstRate : null) ?? service.taxRate ?? null)
    .filter((rate: number | null): rate is number => rate !== null && rate !== undefined);
  const profileSettings = profile as typeof profile & ProfileSettings;
  const taxResolution = resolveTaxRate({
    countryCode,
    isTaxExempt: Boolean(client.isExport) || !supplierChargesGst(profile, countryCode),
    serviceTaxRates,
    workspaceDefaultTaxRate: profileSettings.defaultTaxRate,
    taxRateOverride: taxRateOverrideValue,
  });

  if (taxResolution.requiresUserInput) {
    throw new InvoiceValidationError(422, {
      error: "Tax rate is required before generating this invoice.",
      code: "TAX_RATE_REQUIRED",
      reason: taxResolution.reason,
      countryCode,
      taxLabel: profile.taxLabel || "Tax",
      candidates: taxResolution.candidates || [],
    });
  }

  if (taxResolution.source === "override" && taxRateOverrideValue !== undefined) {
    await prisma.businessProfile.update({
      where: { workspaceId },
      data: { defaultTaxRate: taxResolution.taxRate },
    });
  }

  const totals = calculateInvoiceTotals({
    services: sanitizedServices,
    isTaxExempt: Boolean(client.isExport) || !supplierChargesGst(profile, countryCode),
    defaultTaxRate: taxResolution.taxRate,
  });

  const billingSnapshot: WorkspaceBillingSnapshot = {
    planTier: profile.workspace?.planTier,
    subscriptionStatus: profile.workspace?.subscriptionStatus,
    subscriptionEndsAt: profile.workspace?.subscriptionEndsAt,
  };
  const invoiceLimitDenied = await assertFreeTierMonthlyInvoiceAllowed(workspaceId, date);
  if (invoiceLimitDenied) {
    throw new InvoiceValidationError(403, {
      error: invoiceLimitDenied.message,
      code: invoiceLimitDenied.code,
      limit: invoiceLimitDenied.limit,
    });
  }

  const paidFeatures = canInjectGatewayPaymentLinks(billingSnapshot);
  const userLocale = profile.workspace?.countryCode === "IN" ? "en-IN" : "en-US";
  const workspaceBaseCurrency = profile.workspace?.baseCurrency || "INR";
  const requestedCurrency = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "";
  if (requestedCurrency && !/^[A-Z]{3}$/.test(requestedCurrency)) {
    throw new InvoiceValidationError(400, { error: "Invalid currency code.", code: "INVALID_CURRENCY" });
  }
  const baseCurrency = requestedCurrency || workspaceBaseCurrency;
  const requestedRate = Number(input.exchangeRate);
  const exchangeRate = baseCurrency === workspaceBaseCurrency ? 1 : requestedRate;
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0 || exchangeRate > 1_000_000) {
    throw new InvoiceValidationError(400, {
      error: `An exchange rate to ${workspaceBaseCurrency} is required for ${baseCurrency} invoices.`,
      code: "EXCHANGE_RATE_REQUIRED",
    });
  }

  return {
    workspaceId,
    client,
    profile,
    profileSettings,
    normalizedStatus,
    invoiceDate: date,
    dueDate,
    billingMonthValue,
    sanitizedSacCode,
    sanitizedServices,
    serviceDesc,
    validProductIds,
    totals,
    taxRateOverrideValue,
    taxRate: taxResolution.taxRate,
    countryCode,
    userLocale,
    baseCurrency,
    workspaceBaseCurrency,
    exchangeRate,
    billingSnapshot,
    paidFeatures,
    shouldSendEmail: Boolean(shouldSendEmail),
  };
}
