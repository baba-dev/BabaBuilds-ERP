import { NextResponse } from 'next/server';
import { commitInvoiceStock, InvoiceStockError } from '@/lib/invoices/stock';
import { addInvoiceEvent } from '@/lib/invoices/events';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import { generateInvoicePDF } from '@/lib/pdf/generator';
import fs from 'fs';
import { Prisma } from "@prisma/client";
import crypto from 'crypto';
import { calculateInvoiceTotals } from '@/lib/invoice/totals';
import { resolveTaxRate } from '@/lib/invoice/tax-resolver';
import { toInvoiceStatus } from '@/lib/invoice-status';
import { toDecimal } from '@/lib/money';
import { sendEmail } from '@/lib/mailer';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { logActivity } from '@/lib/activity-log';
import { buildPrivatePath, ensureDir } from '@/lib/uploads/private-storage';
import { determineAndPersistTax } from '@/src/server/tax/service';
import { createPrismaTaxPersistence } from '@/lib/tax/prisma-tax-persistence';
import { appendTaxAuditEvent, newTaxCorrelationId } from '@/lib/tax/audit';
import { buildInvoiceDeliveryEmail } from '@/lib/notifications/transactional-email-templates';
import type { PDFService } from '@/lib/pdf/generator';
import {
  assertFreeTierMonthlyInvoiceAllowed,
  canInjectGatewayPaymentLinks,
  type WorkspaceBillingSnapshot,
} from '@/lib/entitlements';
import { finalizeInvoiceGenerationDraft } from '@/lib/invoice/finalize-draft';
import { getNextInvoiceNumber } from '@/lib/document-numbering';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_PENDING = "PENDING";
const IDEMPOTENCY_CONSUMED = "CONSUMED";

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

type SessionWithWorkspace = {
  workspaceId?: string;
  user?: {
    id?: string | null;
    email?: string | null;
  };
};

type ServiceInput = {
  title?: string;
  amount?: number | string;
  productId?: string | null;
  quantity?: number;
  unitPrice?: number | string;
  sac?: string | number | { igstRate?: number | null } | null;
  taxRate?: number | null;
  sacCode?: string | null;
};

type SanitizedService = ServiceInput & {
  title: string;
  amount: number;
  amountDecimal: Prisma.Decimal;
  nicDetails: string;
  sacCode?: string | null;
};

type PrismaInvoiceItemCreateData = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  taxRate: number;
  totalAmount: Prisma.Decimal;
  sacCode?: string | null;
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

function canonicalize(value: JsonLike): JsonLike {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sortedKeys = Object.keys(value).sort();
    const result: Record<string, JsonLike> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize((value as Record<string, JsonLike>)[key]);
    }
    return result;
  }
  return value;
}

function buildRequestHash(payload: unknown): string {
  const canonicalPayload = canonicalize(payload as JsonLike);
  return crypto.createHash("sha256").update(JSON.stringify(canonicalPayload)).digest("hex");
}


import { GenerateInvoiceSchema } from '@/lib/invoice/generate-schema';
import { snapshotGstFields } from '@/lib/gst/source';
import { supplierChargesGst } from "@/lib/msme/threshold";

export async function POST(request: Request) {
  let generatedPdfPath = "";
  let workspaceId = "";
  let actorId: string | null = null;
  let actorEmail: string | null = null;
  let idempotencyKey: string | null = null;
  let lockCreated = false;
  let currentInvoiceNumber = "";
  let createdInvoiceId: string | null = null;

  try {
    const session = (await getServerSession(authOptions)) as SessionWithWorkspace | null;
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    workspaceId = session.workspaceId;
    actorId = session.user?.id ?? null;
    actorEmail = session.user?.email ?? null;

    const rawBody = await request.json();
    const validation = GenerateInvoiceSchema.safeParse(rawBody);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const body = validation.data;

    if (body.draftId) {
      const finalizeResult = await finalizeInvoiceGenerationDraft({
        draftId: body.draftId,
        workspaceId,
        actorId,
      });
      return NextResponse.json(finalizeResult.response, { status: finalizeResult.status });
    }
    idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || body.idempotencyKey || null;
    const idempotencyBody = { ...body };
    delete idempotencyBody.idempotencyKey;
    const requestHash = buildRequestHash(idempotencyBody);

    // Lazy TTL cleanup strategy (remove expired records opportunistically on access).
    await prisma.invoiceIdempotency.deleteMany({
      where: { workspaceId, expiresAt: { lt: new Date() } }
    });

    if (idempotencyKey) {
      try {
        const existing = await prisma.invoiceIdempotency.findUnique({
          where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
          include: { invoice: true }
        });

        if (existing && existing.expiresAt > new Date()) {
          if (existing.requestHash !== requestHash) {
            return NextResponse.json(
              { error: "Idempotency-Key reuse with different request payload is not allowed." },
              { status: 409 }
            );
          }

          if (existing.status === IDEMPOTENCY_CONSUMED) {
            if (existing.responseBody) {
              return NextResponse.json(existing.responseBody, { status: 200 });
            }
            if (existing.invoice) {
              return NextResponse.json({
                success: true,
                invoice: existing.invoice,
                status: existing.invoice.status,
                emailStatus: "Replayed from idempotency key",
              }, { status: 200 });
            }
          }

          return NextResponse.json(
            { error: "A request with this Idempotency-Key is already in progress." },
            { status: 429 }
          );
        }

        await prisma.invoiceIdempotency.create({
          data: {
            workspaceId,
            idempotencyKey,
            requestHash,
            status: IDEMPOTENCY_PENDING,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
          }
        });
        lockCreated = true;
      } catch (idempotencyErr) {
        if (idempotencyErr instanceof Prisma.PrismaClientKnownRequestError && idempotencyErr.code === "P2002") {
          return NextResponse.json(
            { error: "Duplicate request in progress. Please retry after a moment." },
            { status: 429 }
          );
        }
        throw idempotencyErr;
      }
    }

    const { clientId, billingMonth, sacCode, services, customDate, sendEmail: shouldSendEmail, status: rawStatus, taxRateOverride } = body;
    const billingMonthValue = billingMonth;
    const servicesInput = services;
    const taxRateOverrideValue = taxRateOverride;
    const normalizedStatus = toInvoiceStatus(rawStatus);

    let parsedCustomDate: Date | null = null;
    if (customDate) {
      parsedCustomDate = new Date(customDate);
    }

    const sanitizedServices: SanitizedService[] = servicesInput
      .map((s): SanitizedService => {
        return {
          ...s,
          title: s.title,
          amount: s.amount,
          amountDecimal: toDecimal(s.amount).toDecimalPlaces(2),
          nicDetails: '',
          sacCode: typeof s.sacCode === 'string' ? s.sacCode.trim() : null,
        };
      });

    const unverifiedProductIds = sanitizedServices.map((s: { productId?: string | null }) => s.productId).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
    const validProducts = unverifiedProductIds.length > 0 
      ? await prisma.product.findMany({ where: { workspaceId, id: { in: unverifiedProductIds } }, select: { id: true, hsnCode: true, gstRate: true } })
      : [];
    const validProductIds = new Set(validProducts.map((p: { id: string }) => p.id));
    // The product master owns HSN and rate: goods lines never inherit the service SAC default.
    const productGst = new Map(validProducts.map((p) => [p.id, p]));
    for (const s of sanitizedServices) {
      const product = typeof s.productId === 'string' ? productGst.get(s.productId) : undefined;
      if (!product) continue;
      if (product.hsnCode) s.sacCode = product.hsnCode;
      if (product.gstRate !== null && (s.taxRate === null || s.taxRate === undefined)) s.taxRate = product.gstRate / 100; // services carry fractions; the product master stores percent
    }

    const date = parsedCustomDate ?? new Date();
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: [{ field: "customDate", message: "Custom date is invalid. Please provide a valid date value." }]
        },
        { status: 400 }
      );
    }
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 7);

    const serviceDesc = sanitizedServices.map((s) => s.title).join(" + ");
    if (!serviceDesc.trim()) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: [{ field: "services.title", message: "At least one service title is required." }]
        },
        { status: 400 }
      );
    }

    if (serviceDesc.length > 2000) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: [{ field: "services", message: "Combined service description is too long for invoice generation." }]
        },
        { status: 400 }
      );
    }

    const sanitizedSacCode = typeof sacCode === "string" ? sacCode.trim() : "";
    if (sanitizedSacCode.length > 100) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: [{ field: "sacCode", message: "SAC code is too long." }]
        },
        { status: 400 }
      );
    }

    if (billingMonthValue.trim().length > 100) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: [{ field: "billingMonth", message: "Billing month is too long." }]
        },
        { status: 400 }
      );
    }

    // 2. FETCH CLIENT
    const client = await prisma.client.findFirst({
      where: { id: clientId, workspaceId }
    });
    if (!client) return NextResponse.json({ error: "Selected client does not exist in your CRM." }, { status: 404 });
    // 3. FETCH PROFILE & WORKSPACE
    const profile = await prisma.businessProfile.findUnique({
      where: { workspaceId },
      include: { workspace: true, primaryBankAccount: true }
    });
    if (!profile) return NextResponse.json({ error: "Business profile missing. Please complete Settings Wizard." }, { status: 400 });
    const countryCode = profile.workspace?.countryCode || "IN";
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
      return NextResponse.json({
        error: "Tax rate is required before generating this invoice.",
        code: "TAX_RATE_REQUIRED",
        reason: taxResolution.reason,
        countryCode,
        taxLabel: profile.taxLabel || "Tax",
        candidates: taxResolution.candidates || [],
      }, { status: 422 });
    }

    if (taxResolution.source === 'override' && taxRateOverrideValue !== undefined) {
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

    const invoiceDate = customDate ? new Date(customDate) : new Date();
    const billingSnapshot: WorkspaceBillingSnapshot = {
      planTier: profile.workspace?.planTier,
      subscriptionStatus: profile.workspace?.subscriptionStatus,
      subscriptionEndsAt: profile.workspace?.subscriptionEndsAt,
    };
    const invoiceLimitDenied = await assertFreeTierMonthlyInvoiceAllowed(workspaceId, invoiceDate);
    if (invoiceLimitDenied) {
      return NextResponse.json(
        {
          error: invoiceLimitDenied.message,
          code: invoiceLimitDenied.code,
          limit: invoiceLimitDenied.limit,
        },
        { status: 403 },
      );
    }

    const paidFeatures = canInjectGatewayPaymentLinks(billingSnapshot);
    const userLocale = profile.workspace?.countryCode === "IN" ? "en-IN" : "en-US";
    const workspaceBaseCurrency = profile.workspace?.baseCurrency || 'INR';
    // Multi-currency: the invoice (PDF, payment link, email) is in `baseCurrency`, reports use the base-currency equivalent.
    const baseCurrency = body.currency ?? workspaceBaseCurrency;
    const exchangeRate = baseCurrency === workspaceBaseCurrency ? 1 : body.exchangeRate;
    if (!exchangeRate) {
      return NextResponse.json(
        { error: `An exchange rate to ${workspaceBaseCurrency} is required for ${baseCurrency} invoices.`, code: 'EXCHANGE_RATE_REQUIRED' },
        { status: 400 },
      );
    }
    const invoiceDueDate = new Date(invoiceDate);
    invoiceDueDate.setDate(invoiceDueDate.getDate() + 7);

    const formattedTotal = totals.total.toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const currentMonth = invoiceDate.getMonth() + 1;
    const currentYear = invoiceDate.getFullYear();
    const shortYear = currentYear.toString().slice(-2);
    const fy = currentMonth <= 3
      ? `${parseInt(shortYear) - 1}-${shortYear}`
      : `${shortYear}-${parseInt(shortYear) + 1}`;

    // --- ATOMIC RETRY LOGIC FOR SEQUENCE CONCURRENCY ---
    let newInvoice;
    let attempts = 0;
    const MAX_ATTEMPTS = 5;

    let finalPdfFilename = "";
    let finalPdfPath = "";
    let paymentLinkAttempted = false;
    let paymentLinkCreated = false;
    let paymentLinkSkipReason:
      | "NOT_ELIGIBLE_PLAN"
      | "UNSUPPORTED_DEFAULT_GATEWAY"
      | "UNSUPPORTED_CURRENCY"
      | "MISSING_GATEWAY_CREDENTIALS"
      | "GATEWAY_CALL_FAILED"
      | null = null;

    while (attempts < MAX_ATTEMPTS) {
      try {
        // 4. ISOLATED SEQUENCING
        const { invoiceNumber } = await getNextInvoiceNumber(prisma, workspaceId, invoiceDate, profile.invoicePrefix || 'INV');
        currentInvoiceNumber = invoiceNumber;

        // 5. NAMESPACED PDF STORAGE (private)
        const invoicesDir = buildPrivatePath('invoices', [workspaceId]);
        await ensureDir(invoicesDir);

        const pdfFilename = `${invoiceNumber.replace(/\//g, '_')}.pdf`;
        finalPdfFilename = pdfFilename;
        const pdfPath = buildPrivatePath('invoices', [workspaceId, pdfFilename]);
        finalPdfPath = pdfPath;
        generatedPdfPath = pdfPath;
        const relativePdfPath = `/invoices/${workspaceId}/${pdfFilename}`;

        // ── SMART PAYMENT GATEWAY ROUTER (PRO only) ────────────────────────────
        let paymentLink: string | null = null;
        let providerPaymentLinkId: string | null = null;
        let providerGateway: string | null = null;
        paymentLinkAttempted = false;
        paymentLinkCreated = false;
        paymentLinkSkipReason = null;

        if (paidFeatures) {
          const defaultGateway = profileSettings.defaultGateway || 'RAZORPAY';

          if (
            defaultGateway === 'RAZORPAY' &&
            baseCurrency === 'INR' &&
            profileSettings.razorpayKeyId &&
            profileSettings.razorpayKeySecret
          ) {
            paymentLinkAttempted = true;
            try {
              const { decrypt } = await import('@/lib/encryption');
              const { generateTenantPaymentLink } = await import('@/lib/razorpay-links');

              let decryptedSecret = profileSettings.razorpayKeySecret as string;
              try {
                decryptedSecret = decrypt(profileSettings.razorpayKeySecret);
              } catch {
                // Legacy compatibility: older rows may still store plaintext.
                // We keep runtime behavior permissive so payment links continue working.
                console.warn('[generate] Using legacy plaintext Razorpay secret fallback for payment link generation.');
              }

              const linkResult = await generateTenantPaymentLink({
                amount: toDecimal(totals.total).toNumber(),
                currency: baseCurrency,
                description: `Invoice ${invoiceNumber}`,
                invoiceDueDate: invoiceDueDate,
                customerDetails: {
                  name: client.name,
                  email: client.email ?? undefined,
                },
                tenantKeyId: profileSettings.razorpayKeyId,
                tenantKeySecret: decryptedSecret,
              });

              if (linkResult) {
                paymentLink = linkResult.url;
                providerPaymentLinkId = linkResult.linkId;
                providerGateway = 'RAZORPAY';
                paymentLinkCreated = true;
              } else {
                paymentLinkSkipReason = "GATEWAY_CALL_FAILED";
              }
            } catch (rzpErr) {
              // Non-fatal — PDF still generates without the link
              console.error('[generate] Razorpay link generation failed (non-fatal):', rzpErr);
              paymentLinkSkipReason = "GATEWAY_CALL_FAILED";
            }

          } else if (
            defaultGateway === 'STRIPE' &&
            profileSettings.stripePublishableKey &&
            profileSettings.stripeSecretKey
          ) {
            paymentLinkAttempted = true;
            try {
              const { decrypt } = await import('@/lib/encryption');
              const { generateStripePaymentLink } = await import('@/lib/stripe-links');

              let decryptedSecret = profileSettings.stripeSecretKey as string;
              try {
                decryptedSecret = decrypt(profileSettings.stripeSecretKey);
              } catch {
                // Legacy compatibility for historical plaintext rows.
                console.warn('[generate] Using legacy plaintext Stripe secret fallback for payment link generation.');
              }

              const linkResult = await generateStripePaymentLink({
                amount: toDecimal(totals.total).toNumber(),    // in major units — service converts to smallest unit internally
                currency: baseCurrency,   // passes locale currency accurately for correct unit math
                description: `Invoice ${invoiceNumber}`,
                invoiceNumber,
                tenantSecretKey: decryptedSecret,
              });

              if (linkResult) {
                paymentLink = linkResult.url;
                providerPaymentLinkId = linkResult.linkId;
                providerGateway = 'STRIPE';
                paymentLinkCreated = true;
              } else {
                paymentLinkSkipReason = "GATEWAY_CALL_FAILED";
              }
            } catch (stripeErr) {
              // Non-fatal — PDF still generates without the link
              console.error('[generate] Stripe link generation failed (non-fatal):', stripeErr);
              paymentLinkSkipReason = "GATEWAY_CALL_FAILED";
            }
          } else if (defaultGateway === 'RAZORPAY') {
            if (baseCurrency !== 'INR') {
              console.info(`[generate] Razorpay link skipped: unsupported currency "${baseCurrency}" (requires INR).`);
              paymentLinkSkipReason = "UNSUPPORTED_CURRENCY";
            } else if (!profileSettings.razorpayKeyId || !profileSettings.razorpayKeySecret) {
              console.info('[generate] Razorpay link skipped: missing Razorpay credentials in workspace settings.');
              paymentLinkSkipReason = "MISSING_GATEWAY_CREDENTIALS";
            }
          } else if (defaultGateway === 'STRIPE') {
            if (!profileSettings.stripePublishableKey || !profileSettings.stripeSecretKey) {
              console.info('[generate] Stripe link skipped: missing Stripe credentials in workspace settings.');
              paymentLinkSkipReason = "MISSING_GATEWAY_CREDENTIALS";
            }
          } else {
            console.info(`[generate] Payment link skipped: unsupported default gateway "${String(defaultGateway)}".`);
            paymentLinkSkipReason = "UNSUPPORTED_DEFAULT_GATEWAY";
          }
        } else {
          console.info('[generate] Payment link skipped: workspace is not eligible for gateway links under current billing plan/trial state.');
          paymentLinkSkipReason = "NOT_ELIGIBLE_PLAN";
        }
        // ──────────────────────────────────────────────────────────────────────

        // --- PDF GENERATION ENGINE ---
        const pdfBytes = await generateInvoicePDF({
          profile,
          client: {
            name: client.name,
            address: client.address,
            country: client.country,
            email: client.email,
            taxId: client.taxId,
            isExport: client.isExport,
            logoUrl: client.logoUrl,
          },
          invoiceNumber,
          date: invoiceDate,
          dueDate: invoiceDueDate,
          billingMonth: billingMonthValue,
          sacCode: sacCode ?? null,
          services: sanitizedServices.map((s): PDFService => ({
            title: s.title,
            nicDetails: '',
            amount: s.amount,
            sacCode: s.sacCode || sacCode || profile.defaultSacCode || null,
          })),
          totals,
          formattedTotal,
          baseCurrency,
          userLocale,
          paymentLink,
          status: normalizedStatus
        });
        console.info("[invoice-generate] asset preflight", {
          workspaceId,
          invoiceNumber,
          profileLogoUrl: profile.logoUrl ?? null,
          clientLogoUrl: client.logoUrl ?? null,
          paymentLinkAttempted,
          paymentLinkCreated,
          paymentLinkSkipReason,
        });

        await fs.promises.writeFile(pdfPath, pdfBytes, { mode: 0o600 });

        // 6. SAVE TO DB + persisted tax determination (same transaction)
        const correlationId = newTaxCorrelationId();
        newInvoice = await prisma.$transaction(async (tx) => {
          const inv = await tx.invoice.create({
            data: {
              workspaceId,
              invoiceNumber,
              financialYear: fy,
              billingMonth: billingMonthValue,
              invoiceDate,
              clientName: client.name,
              clientId: client.id,
              sacCode: typeof sacCode === 'string' ? sacCode : JSON.stringify(sacCode),
              serviceDescription: serviceDesc,
              subtotal: toDecimal(totals.subtotal).toDecimalPlaces(2),
              taxRate: totals.taxRate,
              taxAmount: toDecimal(totals.taxAmount).toDecimalPlaces(2),
              grandTotal: toDecimal(totals.total).toDecimalPlaces(2),
              taxMode: totals.taxMode,
              totalAmount: toDecimal(totals.total).toDecimalPlaces(2),
              pdfPath: relativePdfPath,
              status: normalizedStatus,
              dueDate: invoiceDueDate,
              paymentTermsDays: 7,
              currency: baseCurrency,
              exchangeRate,
              baseGrandTotal: toDecimal(totals.total).mul(exchangeRate).toDecimalPlaces(2),
              source: body.source ?? 'MANUAL',
              ...snapshotGstFields(client, body.gst),
              providerGateway,
              providerPaymentLinkId,
              items: {
                create: sanitizedServices.map((s): PrismaInvoiceItemCreateData => ({
                  productId:
                    typeof s.productId === 'string' && validProductIds.has(s.productId)
                      ? s.productId
                      : null,
                  description: s.title,
                  quantity: s.quantity || 1,
                  unitPrice: toDecimal(s.unitPrice || s.amount).toDecimalPlaces(2),
                  taxRate: taxResolution.taxRate,
                  totalAmount: toDecimal(s.amount).toDecimalPlaces(2),
                  sacCode: s.sacCode || sacCode || null,
                })),
              },
            },
          });

          // Policy: stock leaves when the invoice is issued (throws -> whole invoice rolls back).
          await commitInvoiceStock(tx, { workspaceId, invoiceId: inv.id, actorUserId: actorId });
          await addInvoiceEvent(tx, { workspaceId, invoiceId: inv.id, type: 'CREATED', message: `Invoice ${invoiceNumber} created`, actorUserId: actorId });

          await determineAndPersistTax(createPrismaTaxPersistence(tx), {
            source: {
              kind: 'invoice',
              entityId: inv.id,
              workspaceId,
              taxableAmount: totals.subtotal,
              originCountryCode: countryCode,
              destinationCountryCode: countryCode,
              clientId: client.id,
              occurredAt: invoiceDate,
              isTaxExempt: Boolean(client.isExport) || !supplierChargesGst(profile, countryCode),
            },
            actorUserId: actorId ?? 'system',
          });

          await appendTaxAuditEvent(tx, {
            workspaceId,
            eventType: 'DETERMINATION',
            correlationId,
            actorUserId: actorId,
            entityType: 'Invoice',
            entityId: inv.id,
            payload: {
              invoiceNumber,
              clientId: client.id,
              subtotal: totals.subtotal,
              engineTaxAmount: totals.taxAmount,
            },
          });

          return inv;
        });
        createdInvoiceId = newInvoice.id;

        break;

      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          attempts++;
          console.warn(`Sequence collision on attempt ${attempts}. Retrying...`);
          if (generatedPdfPath && fs.existsSync(generatedPdfPath)) {
            fs.unlinkSync(generatedPdfPath);
          }
          continue;
        }
        throw err;
      }
    }

    if (!newInvoice) {
      throw new Error("Could not generate a unique invoice number after multiple attempts.");
    }

    // ── INVOICE_GENERATED Notification (fire-and-forget) ──────────────────
    const userLocaleStr = profile.workspace?.baseCurrency || 'INR';
    dispatchNotification({
      event: 'INVOICE_GENERATED',
      workspaceId,
      data: {
        invoiceNumber: currentInvoiceNumber,
        clientName: client.name,
        amount: `${userLocaleStr} ${formattedTotal}`,
        pdfUrl: `/invoices/${workspaceId}/${finalPdfFilename}`,
      },
    }).catch(() => null);

    // --- EMAIL DELIVERY LOGIC ---
    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'invoice', action: 'create', error: String(error) });
    }

    let emailStatus = "Not requested";

    if (shouldSendEmail) {
      if (!client.email) {
        emailStatus = "Failed: Client has no email address on file.";
      } else if (!profile.smtpHost || !profile.smtpUser || !profile.smtpPassword) {
        emailStatus = "Failed: SMTP Server not configured in Settings.";
      } else {
        try {
          const invoiceEmail = buildInvoiceDeliveryEmail({
            companyName: profile.companyName,
            clientName: client.name,
            invoiceNumber: currentInvoiceNumber,
            billingMonth: billingMonthValue,
            amountFormatted: `${baseCurrency} ${formattedTotal}`,
            locale: userLocale,
          });
          await sendEmail({
            route: 'user',
            profile,
            to: client.email,
            subject: invoiceEmail.subject,
            html: invoiceEmail.html,
            text: invoiceEmail.text,
            attachments: [{ filename: finalPdfFilename, path: finalPdfPath }],
          });
          emailStatus = "Success";
        } catch (emailErr: unknown) {
          console.error("Email Error:", emailErr);
          emailStatus = `Failed: ${emailErr instanceof Error ? emailErr.message : 'Unknown email error'}`;
        }
      }
    }

    const successResponse = {
      success: true,
      invoice: newInvoice,
      status: newInvoice.status,
      emailStatus,
      paymentLinkStatus: {
        attempted: paymentLinkAttempted,
        created: paymentLinkCreated,
        skipReason: paymentLinkCreated ? null : paymentLinkSkipReason,
      },
    };

    if (idempotencyKey) {
      await prisma.invoiceIdempotency.update({
        where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
        data: {
          status: IDEMPOTENCY_CONSUMED,
          invoiceId: newInvoice.id,
          responseBody: successResponse as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        }
      });
    }

    logActivity({
      action: "invoice_generate",
      outcome: "success",
      entityType: "invoice",
      entityId: newInvoice.id,
      workspaceId,
      actorId,
      actorEmail,
      metadata: {
        invoiceId: newInvoice.id,
        invoiceNumber: newInvoice.invoiceNumber,
        emailRequested: Boolean(shouldSendEmail),
      },
    });

    return NextResponse.json(successResponse);

  } catch (error: unknown) {
    console.error("Invoice Generation Error:", error);

    if (generatedPdfPath && fs.existsSync(generatedPdfPath)) {
      try {
        fs.unlinkSync(generatedPdfPath);
        console.log(`🧹 Cleaned up orphaned PDF file after failure: ${generatedPdfPath}`);
      } catch (cleanupError) {
        console.error("Failed to delete orphaned file:", cleanupError);
      }
    }

    if (lockCreated && idempotencyKey) {
      try {
        await prisma.invoiceIdempotency.delete({
          where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } }
        });
      } catch (cleanupErr) {
        console.error("Failed to release idempotency lock after error:", cleanupErr);
      }
    }

    logActivity({
      action: "invoice_generate",
      outcome: "error",
      entityType: "invoice",
      entityId: createdInvoiceId,
      workspaceId: workspaceId || null,
      actorId,
      actorEmail,
      metadata: {
        invoiceId: createdInvoiceId,
        invoiceNumber: currentInvoiceNumber || null,
        idempotencyKeyPresent: Boolean(idempotencyKey),
        errorMessage: error instanceof Error ? error.message : "Unknown invoice generation error",
      },
    });

    if (error instanceof InvoiceStockError) {
      return NextResponse.json(
        { error: `Not enough stock to issue this invoice${error.productName ? ` (${error.productName})` : ''}.`, code: 'INSUFFICIENT_STOCK' },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate invoice' },
      { status: 400 },
    );
  }
}
