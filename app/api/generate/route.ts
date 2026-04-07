import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { generateInvoicePDF } from '@/lib/pdf/generator';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import dns from 'dns';
import { promisify } from 'util';
import { Prisma } from "@prisma/client";
import crypto from 'crypto';
import { calculateInvoiceTotals } from '@/lib/invoice/totals';
import { resolveTaxRate } from '@/lib/invoice/tax-resolver';
import { toDecimal } from '@/lib/money';

const lookupAsync = promisify(dns.lookup);
const ALLOWED_STATUSES = ["Pending", "Partially Paid", "Paid"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_PENDING = "PENDING";
const IDEMPOTENCY_CONSUMED = "CONSUMED";

function normalizeInvoiceStatus(status: unknown): AllowedStatus {
  if (typeof status !== "string") return "Pending";
  const normalizedStatus = status.trim().toLowerCase();
  const matchedStatus = ALLOWED_STATUSES.find(
    (allowedStatus) => allowedStatus.toLowerCase() === normalizedStatus
  );
  return matchedStatus ?? "Pending";
}

async function resolveSafeIp(host: string): Promise<string | null> {
  try {
    if (host.toLowerCase() === 'localhost') return null;

    const { address } = await lookupAsync(host);

    if (address.startsWith('127.')) return null; 
    if (address.startsWith('10.')) return null; 
    if (address.startsWith('192.168.')) return null; 
    if (address.startsWith('169.254.')) return null; 
    if (address === '0.0.0.0') return null;

    if (address.startsWith('172.')) {
      const secondOctet = parseInt(address.split('.')[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) return null;
    }

    if (address === '::1') return null;
    if (address.toLowerCase().startsWith('fe80:')) return null;

    return address; 
  } catch (e) {
    return null; 
  }
}

function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sortedKeys = Object.keys(value).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return value;
}

function buildRequestHash(payload: unknown): string {
  const canonicalPayload = canonicalize(payload);
  return crypto.createHash("sha256").update(JSON.stringify(canonicalPayload)).digest("hex");
}


export async function POST(request: Request) {
  let generatedPdfPath = ""; 
  let workspaceId = "";
  let idempotencyKey: string | null = null;
  let lockCreated = false;

  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    workspaceId = (session as any).workspaceId;

    const body = await request.json();
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
              return NextResponse.json(existing.responseBody as any, { status: 200 });
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

    const { clientId, billingMonth, sacCode, services, customDate, sendEmail, status: rawStatus, taxRateOverride } = body;
    const normalizedStatus = normalizeInvoiceStatus(rawStatus);
    const validationErrors: Array<{ field: string; message: string; index?: number }> = [];

    if (!clientId) return NextResponse.json({ error: "No client selected." }, { status: 400 });
    if (typeof billingMonth !== "string" || billingMonth.trim().length === 0) {
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

    if (!Array.isArray(services) || services.length === 0) {
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
    const sanitizedServices = services
      .map((s: any, index: number) => {
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

        return { ...s, title, amount: amt, amountDecimal: toDecimal(amt).toDecimalPlaces(2) };
      });

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", fields: validationErrors },
        { status: 400 }
      );
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

    const serviceDesc = sanitizedServices.map((s: any) => s.title).join(" + ");
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

    if (billingMonth.trim().length > 100) {
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
      include: { workspace: true }
    });
    if (!profile) return NextResponse.json({ error: "Business profile missing. Please complete Settings Wizard." }, { status: 400 });
    const countryCode = profile.workspace?.countryCode || "IN";
    const serviceTaxRates = sanitizedServices
      .map((service: any) => service?.sac?.igstRate ?? service?.taxRate ?? null)
      .filter((rate: any) => rate !== null && rate !== undefined);
    const taxResolution = resolveTaxRate({
      countryCode,
      isTaxExempt: Boolean(client.isExport),
      serviceTaxRates,
      workspaceDefaultTaxRate: (profile as any).defaultTaxRate,
      taxRateOverride,
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

    if (taxResolution.source === 'override' && taxRateOverride !== undefined && taxRateOverride !== null && taxRateOverride !== '') {
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

    const isFreePlan     = profile.workspace?.planTier === "FREE";
    const isProPlan      = !isFreePlan;
    const userLocale     = profile.workspace?.countryCode === "IN" ? "en-IN" : "en-US";
    const invoiceTheme   = (profile as any).invoiceTheme || "DESIGN_1";
    const baseCurrency   = profile.workspace?.baseCurrency || 'INR';

    const invoiceDate = customDate ? new Date(customDate) : new Date();
    const invoiceDueDate = new Date(invoiceDate);
    invoiceDueDate.setDate(invoiceDueDate.getDate() + 7);

    const formattedTotal = totals.total.toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const currentMonth = invoiceDate.getMonth() + 1; 
    const currentYear  = invoiceDate.getFullYear();
    const shortYear    = currentYear.toString().slice(-2);
    let fy = currentMonth <= 3
      ? `${parseInt(shortYear) - 1}-${shortYear}`
      : `${shortYear}-${parseInt(shortYear) + 1}`;

    // --- ATOMIC RETRY LOGIC FOR SEQUENCE CONCURRENCY ---
    let newInvoice;
    let attempts = 0;
    const MAX_ATTEMPTS = 5;
    
    let currentInvoiceNumber = "";
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
        
        // 5. NAMESPACED PDF STORAGE
        const invoicesDir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'invoices', workspaceId);
        if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true });
        
        const pdfFilename  = `${invoiceNumber.replace(/\//g, '_')}.pdf`;
        finalPdfFilename   = pdfFilename;
        const pdfPath      = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'invoices', workspaceId, pdfFilename);
        finalPdfPath       = pdfPath;
        generatedPdfPath   = pdfPath;
        const relativePdfPath = `/invoices/${workspaceId}/${pdfFilename}`; 

        // ── SMART PAYMENT GATEWAY ROUTER (PRO only) ────────────────────────────
        let paymentLink: string | null = null;

        if (isProPlan) {
          const defaultGateway = (profile as any).defaultGateway || 'RAZORPAY';

          if (
            defaultGateway === 'RAZORPAY' &&
            baseCurrency === 'INR' &&
            (profile as any).razorpayKeyId &&
            (profile as any).razorpayKeySecret
          ) {
            try {
              const { decrypt }                   = await import('@/lib/encryption');
              const { generateTenantPaymentLink } = await import('@/lib/razorpay-links');

              const decryptedSecret = decrypt((profile as any).razorpayKeySecret);

              paymentLink = await generateTenantPaymentLink({
                amount:          toDecimal(totals.total).toNumber(),
                currency:        baseCurrency,
                description:     `Invoice ${invoiceNumber}`,
                invoiceDueDate:  invoiceDueDate,
                customerDetails: {
                  name:  client.name,
                  email: client.email ?? undefined,
                },
                tenantKeyId:     (profile as any).razorpayKeyId,
                tenantKeySecret: decryptedSecret,
              });
            } catch (rzpErr) {
              // Non-fatal — PDF still generates without the link
              console.error('[generate] Razorpay link generation failed (non-fatal):', rzpErr);
              paymentLink = null;
            }

          } else if (
            defaultGateway === 'STRIPE' &&
            (profile as any).stripePublishableKey &&
            (profile as any).stripeSecretKey
          ) {
            try {
              const { decrypt }                   = await import('@/lib/encryption');
              const { generateStripePaymentLink } = await import('@/lib/stripe-links');

              const decryptedSecret = decrypt((profile as any).stripeSecretKey);

              paymentLink = await generateStripePaymentLink({
                amount:          toDecimal(totals.total).toNumber(),    // in major units — service converts to smallest unit internally
                currency:        baseCurrency,   // passes locale currency accurately for correct unit math
                description:     `Invoice ${invoiceNumber}`,
                invoiceNumber,
                tenantSecretKey: decryptedSecret,
              });
            } catch (stripeErr) {
              // Non-fatal — PDF still generates without the link
              console.error('[generate] Stripe link generation failed (non-fatal):', stripeErr);
              paymentLink = null;
            }
          }
        }
        // ──────────────────────────────────────────────────────────────────────

        // --- PDF GENERATION ENGINE ---
        const pdfBytes = await generateInvoicePDF({
          profile,
          client: client as any,
          invoiceNumber,
          date: invoiceDate,
          dueDate: invoiceDueDate,
          billingMonth,
          sacCode,
          services: sanitizedServices,
          totals,
          formattedTotal,
          baseCurrency,
          userLocale,
          paymentLink,
          status: normalizedStatus
        });

        fs.writeFileSync(pdfPath, pdfBytes);

        // 6. SAVE TO DB
        newInvoice = await prisma.invoice.create({
          data: {
            workspaceId, 
            invoiceNumber, financialYear: fy, billingMonth, invoiceDate, 
            clientName: client.name, clientId: client.id,
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
          } as any,
        });

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

    // --- EMAIL DELIVERY LOGIC ---
    let emailStatus = "Not requested";
    
    if (sendEmail) {
      if (!client.email) {
        emailStatus = "Failed: Client has no email address on file.";
      } else if (!profile.smtpHost || !profile.smtpUser || !profile.smtpPassword) {
        emailStatus = "Failed: SMTP Server not configured in Settings.";
      } else {
        const safeIp = await resolveSafeIp(profile.smtpHost);
        
        if (!safeIp) {
          emailStatus = "Failed: Invalid or internal SMTP Host blocked by security policy.";
          console.error(`Blocked SSRF attempt in SMTP configuration: ${profile.smtpHost}`);
        } else {
          try {
            const transporter = nodemailer.createTransport({
              host:   safeIp, 
              port:   profile.smtpPort || 587,
              secure: profile.smtpPort === 465, 
              tls:    { servername: profile.smtpHost },
              auth:   { user: profile.smtpUser, pass: profile.smtpPassword },
            });

            const mailOptions = {
              from:    `"${profile.companyName}" <${profile.smtpFromEmail || profile.smtpUser}>`,
              to:      client.email,
              subject: `Invoice ${currentInvoiceNumber} from ${profile.companyName}`,
              text:    `Dear ${client.name},\n\nPlease find attached the invoice ${currentInvoiceNumber} for the billing month of ${billingMonth}.\n\nTotal Amount Billed: ${baseCurrency} ${formattedTotal}\n\nThank you for your business.\n\nBest Regards,\n${profile.companyName}`,
              attachments: [{ filename: finalPdfFilename, path: finalPdfPath }],
            };

            await transporter.sendMail(mailOptions);
            emailStatus = "Success";
          } catch (emailErr: any) {
            console.error("Email Error:", emailErr);
            emailStatus = `Failed: ${emailErr.message}`;
          }
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

    return NextResponse.json(successResponse);

  } catch (error: any) {
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

    return NextResponse.json({ error: error.message || 'Failed to generate invoice' }, { status: 400 });
  }
}
