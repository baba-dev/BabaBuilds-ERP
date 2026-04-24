import { NextResponse } from 'next/server';
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
  productId?: string;
  quantity?: number;
  unitPrice?: number | string;
  sac?: {
    igstRate?: number | null;
  };
  taxRate?: number | null;
};

type SanitizedService = ServiceInput & {
  title: string;
  amount: number;
  amountDecimal: Prisma.Decimal;
  nicDetails: string;
};

type PrismaInvoiceItemCreateData = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  taxRate: number;
  totalAmount: Prisma.Decimal;
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
    // 1. SECURITY LOCK
    const session = (await getServerSession(authOptions)) as SessionWithWorkspace | null;
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    workspaceId = session.workspaceId;
    actorId = session.user?.id ?? null;
    actorEmail = session.user?.email ?? null;

    const body = (await request.json()) as {
      idempotencyKey?: string;
      clientId?: string;
      billingMonth?: string;
      sacCode?: string;
      services?: ServiceInput[];
      customDate?: string;
      sendEmail?: boolean;
      status?: string;
      taxRateOverride?: number;
    };
    idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || body?.idempotencyKey?.trim() || null;
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
    const billingMonthValue = typeof billingMonth === "string" ? billingMonth : "";
    const servicesInput: ServiceInput[] = Array.isArray(services) ? services : [];
    const taxRateOverrideValue = typeof taxRateOverride === 'number' ? taxRateOverride : undefined;
    const normalizedStatus = toInvoiceStatus(rawStatus);
    const validationErrors: Array<{ field: string; message: string; index?: number }> = [];

    if (!clientId) return NextResponse.json({ error: "No client selected." }, { status: 400 });
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
      return NextResponse.json(
        { error: "Validation failed", fields: validationErrors },
        { status: 400 }
      );
    }

    // --- 🚨 SECURITY PATCH: Prevent malformed service payloads / NaN Poisoning ---
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
          nicDetails: '',
        };
      });

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", fields: validationErrors },
        { status: 400 }
      );
    }

    const unverifiedProductIds = sanitizedServices.map((s: { productId?: string }) => s.productId).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
    const validProducts = unverifiedProductIds.length > 0 
      ? await prisma.product.findMany({ where: { workspaceId, id: { in: unverifiedProductIds } }, select: { id: true } })
      : [];
    const validProductIds = new Set(validProducts.map((p: { id: string }) => p.id));

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
      .map((service: SanitizedService) => service.sac?.igstRate ?? service.taxRate ?? null)
      .filter((rate: number | null): rate is number => rate !== null && rate !== undefined);
    const profileSettings = profile as typeof profile & ProfileSettings;
    const taxResolution = resolveTaxRate({
      countryCode,
      isTaxExempt: Boolean(client.isExport),
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
      isTaxExempt: Boolean(client.isExport),
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
    const baseCurrency = profile.workspace?.baseCurrency || 'INR';
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

    while (attempts < MAX_ATTEMPTS) {
      try {
        // 4. ISOLATED SEQUENCING
        const lastInvoice = await prisma.invoice.findFirst({
          where: { financialYear: fy, workspaceId },
          orderBy: { createdAt: 'desc' },
        });

        let sequence = 1;
        if (lastInvoice && lastInvoice.invoiceNumber) {
          const parts = lastInvoice.invoiceNumber.split('/');
          if (parts.length === 3 && !isNaN(parseInt(parts[2]))) {
            sequence = parseInt(parts[2]) + 1;
          }
        }
        const invoiceNumber = `INV/${fy}/${sequence.toString().padStart(3, '0')}`;
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

        if (paidFeatures) {
          const defaultGateway = profileSettings.defaultGateway || 'RAZORPAY';

          if (
            defaultGateway === 'RAZORPAY' &&
            baseCurrency === 'INR' &&
            profileSettings.razorpayKeyId &&
            profileSettings.razorpayKeySecret
          ) {
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
              }
            } catch (rzpErr) {
              // Non-fatal — PDF still generates without the link
              console.error('[generate] Razorpay link generation failed (non-fatal):', rzpErr);
            }

          } else if (
            defaultGateway === 'STRIPE' &&
            profileSettings.stripePublishableKey &&
            profileSettings.stripeSecretKey
          ) {
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
              }
            } catch (stripeErr) {
              // Non-fatal — PDF still generates without the link
              console.error('[generate] Stripe link generation failed (non-fatal):', stripeErr);
            }
          }
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
          })),
          totals,
          formattedTotal,
          baseCurrency,
          userLocale,
          paymentLink,
          status: normalizedStatus
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
                })),
              },
            },
          });

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
              isTaxExempt: Boolean(client.isExport),
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
      emailStatus
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

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate invoice' },
      { status: 400 },
    );
  }
}
