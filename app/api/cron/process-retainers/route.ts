import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  format, 
  addMonths, 
  addYears, 
  isLastDayOfMonth, 
  endOfMonth, 
  isWeekend, 
  previousFriday 
} from "date-fns";
import fs from 'fs';
import path from 'path';
import { calculateInvoiceTotals } from '@/lib/invoice/totals';
import { resolveTaxRate } from '@/lib/invoice/tax-resolver';
import { decimalToNumber, toDecimal } from '@/lib/money';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { buildPrivatePath, ensureDir } from '@/lib/uploads/private-storage';
import {
  assertFreeTierMonthlyInvoiceAllowed,
  canInjectGatewayPaymentLinks,
} from '@/lib/entitlements';
import { buildInvoiceViewModel } from '@/lib/invoice/build-invoice-view-model';
import { renderInvoicePdf } from '@/lib/invoice-renderers/render-invoice-pdf';
import { resolveBusinessProfileSettings } from '@/lib/business-profile-inheritance';

// Helper for Indian Financial Year
const getFY = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month < 4) return `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
  return `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`;
};

// --- PDF GENERATION ENGINE FOR CRON ---
async function generateRetainerPDF(
  workspaceId: string,
  retainer: any,
  profile: any,
  invoiceNumber: string,
  billingMonth: string,
  services: { title: string; nicDetails: string; amount: number; sacCode?: string | null }[],
  totals: { subtotal: number; taxRate: number; taxAmount: number; total: number; taxMode: "taxable" | "exempt" | "mixed" },
  paymentLink: string | null = null,
) {
  const client = retainer.client;
  const userLocale = profile.workspace?.countryCode === "IN" ? "en-IN" : "en-US";
  const baseCurrency = profile.workspace?.baseCurrency || "INR";

  const invoiceDate = new Date();
  const dueDate = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + 7);



  const vm = buildInvoiceViewModel({
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
    dueDate,
    billingMonth,
    sacCode: retainer.sacCode || profile.defaultSacCode || "N/A",
    services,
    totals,
    formattedTotal: totals.total.toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    baseCurrency,
    userLocale,
    paymentLink,
    status: "PENDING",
  });

  const pdfBytes = await renderInvoicePdf(vm);

  const invoicesDir = buildPrivatePath("invoices", [workspaceId]);
  await ensureDir(invoicesDir);

  const pdfFilename = `${invoiceNumber.replace(/\//g, "_")}.pdf`;
  const pdfPath = path.join(invoicesDir, pdfFilename);

  fs.writeFileSync(pdfPath, pdfBytes, { mode: 0o600 });

  return `/invoices/${workspaceId}/${pdfFilename}`;
}


export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  try {
    const today = new Date();
    
    // 2. FIND ALL DUE RETAINERS
    const dueRetainers = await prisma.retainer.findMany({
      where: {
        status: "ACTIVE",
        nextBillingDate: { lte: today }
      },
      include: { 
        client: true,
        items: true,
        meteredUsages: { where: { status: "PENDING" } }
      }
    });

    if (dueRetainers.length === 0) {
      return NextResponse.json({ message: "No retainers due for processing today." });
    }

    const results = { successful: 0, failed: 0, logs: [] as string[] };

    // BATCH FETCH PROFILES (Fix N+1 query issue)
    const workspaceIds = Array.from(new Set(dueRetainers.map(r => r.workspaceId)));
    const profiles = await prisma.businessProfile.findMany({
      where: { workspaceId: { in: workspaceIds } },
      include: { workspace: true, primaryBankAccount: true }
    });
    const profileMap = new Map();
    for (const p of profiles) {
      if (p.workspaceId) profileMap.set(p.workspaceId, p);
    }

    // 3. PROCESS EACH RETAINER INDIVIDUALLY (Sequential to maintain safe invoice numbering)
    for (const retainer of dueRetainers) {
      const workspaceId = retainer.workspaceId;
      try {
        const fy = getFY(today);
        const billingMonth = format(retainer.nextBillingDate, "MMMM yyyy");

        // Use Pre-fetched Business Profile for PDF Generation
        const profile = profileMap.get(workspaceId);

        if (!profile) {
          throw new Error("Business profile missing. Cannot generate PDF.");
        }

        const invoiceMonthBlocked = await assertFreeTierMonthlyInvoiceAllowed(workspaceId, today);
        if (invoiceMonthBlocked) {
          throw new Error(invoiceMonthBlocked.message);
        }

        const billingSnap = {
          planTier: profile.workspace?.planTier,
          subscriptionStatus: profile.workspace?.subscriptionStatus,
          subscriptionEndsAt: profile.workspace?.subscriptionEndsAt,
        };

        // A. AUTO-SEQUENCE THE INVOICE NUMBER (Optimistic Concurrency)
        let attempts = 0;
        const MAX_ATTEMPTS = 5;
        let success = false;
        // Track the last generated PDF so we can clean it up if the DB transaction
        // fails and we must retry with a new invoice number.
        let lastGeneratedPdfPath: string | null = null;
        
        while (attempts < MAX_ATTEMPTS && !success) {
          try {
            const lastInvoice = await prisma.invoice.findFirst({
              where: { workspaceId, financialYear: fy },
              orderBy: { createdAt: 'desc' }
            });

            let sequence = 1;
            if (lastInvoice && lastInvoice.invoiceNumber) {
              const parts = lastInvoice.invoiceNumber.split('/');
              if (parts.length === 3 && !isNaN(parseInt(parts[2]))) {
                sequence = parseInt(parts[2]) + 1;
              }
            }
            const invoiceNumber = `INV/${fy}/${sequence.toString().padStart(3, '0')}`;

            // B. THE MAGIC TOGGLE (Smart Naming)
            let baseDescription = "Retainer Billing";
            if (retainer.autoAppendMonth) {
              baseDescription = `Retainer Billing (${billingMonth})`;
            }

            const rawServices: { title: string; amount: number; taxRate: number; sacCode?: string | null }[] = [];
            for (const item of retainer.items) {
              rawServices.push({
                title: retainer.autoAppendMonth ? `${item.title} (${billingMonth})` : item.title,
                amount: decimalToNumber(item.unitPrice) * item.quantity,
                taxRate: item.taxRate || 0,
                sacCode: item.sacCode || retainer.sacCode || profile.defaultSacCode || null,
              });
            }
            for (const usage of retainer.meteredUsages) {
              rawServices.push({
                title: usage.description,
                amount: decimalToNumber(usage.unitPrice) * decimalToNumber(usage.quantity),
                taxRate: 0,
              });
            }

            if (rawServices.length === 0) {
              throw new Error("No active items or usage found for this retainer.");
            }

            const taxResolution = resolveTaxRate({
              countryCode: profile.workspace?.countryCode || "IN",
              isTaxExempt: Boolean(retainer.client.isExport),
              serviceTaxRates: rawServices.map(s => s.taxRate),
              workspaceDefaultTaxRate: (profile as any).defaultTaxRate ?? null,
            });
            if (taxResolution.requiresUserInput) {
              throw new Error(`Missing tax rate configuration for retainer. Please set a workspace default tax rate from UI.`);
            }
            const totals = calculateInvoiceTotals({
              services: rawServices.map(s => ({ amount: s.amount, taxRate: s.taxRate })),
              isTaxExempt: Boolean(retainer.client.isExport),
              defaultTaxRate: taxResolution.taxRate,
            });
            
            const invoiceServices = rawServices.map(s => ({
              title: s.title,
              nicDetails: s.title,
              amount: s.amount,
              sacCode: s.sacCode,
            }));

            // --- PAYMENT LINK GENERATION (paid tier or trial — same as manual invoice generate) ---
            let paymentLink: string | null = null;
            let providerPaymentLinkId: string | null = null;
            let providerGateway: string | null = null;

            const paidFeatures = canInjectGatewayPaymentLinks(billingSnap);
            const baseCurrency = profile.workspace?.baseCurrency || 'INR';
            const dueDate = new Date(today);
            dueDate.setDate(dueDate.getDate() + 7);

            if (paidFeatures) {
              const paymentProfile = await resolveBusinessProfileSettings(profile as typeof profile & {
                inheritPaymentGatewayFromGroup?: boolean | null;
                razorpayKeyId?: string | null;
                razorpayKeySecret?: string | null;
                stripePublishableKey?: string | null;
                stripeSecretKey?: string | null;
                defaultGateway?: string | null;
              }, 'paymentGateway') ?? profile;
              const defaultGateway = (paymentProfile as any).defaultGateway || 'RAZORPAY';

              if (
                defaultGateway === 'RAZORPAY' &&
                baseCurrency === 'INR' &&
                (paymentProfile as any).razorpayKeyId &&
                (paymentProfile as any).razorpayKeySecret
              ) {
                try {
                  const { decrypt }                   = await import('@/lib/encryption');
                  const { generateTenantPaymentLink } = await import('@/lib/razorpay-links');
                  const decryptedSecret = decrypt((paymentProfile as any).razorpayKeySecret);

                  const linkResult = await generateTenantPaymentLink({
                    amount:          totals.total,
                    currency:        baseCurrency,
                    description:     `Invoice ${invoiceNumber}`,
                    invoiceDueDate:  dueDate,
                    customerDetails: {
                      name:  retainer.client.name,
                      email: retainer.client.email ?? undefined,
                    },
                    tenantKeyId:     (paymentProfile as any).razorpayKeyId,
                    tenantKeySecret: decryptedSecret,
                  });

                  if (linkResult) {
                    paymentLink = linkResult.url;
                    providerPaymentLinkId = linkResult.linkId;
                    providerGateway = 'RAZORPAY';
                  }
                } catch (rzpErr) {
                  console.error('[cron] Razorpay link failed:', rzpErr);
                }
              } else if (
                defaultGateway === 'STRIPE' &&
                (paymentProfile as any).stripePublishableKey &&
                (paymentProfile as any).stripeSecretKey
              ) {
                try {
                  const { decrypt }                   = await import('@/lib/encryption');
                  const { generateStripePaymentLink } = await import('@/lib/stripe-links');
                  const decryptedSecret = decrypt((paymentProfile as any).stripeSecretKey);

                  const linkResult = await generateStripePaymentLink({
                    amount:          totals.total,
                    currency:        baseCurrency,
                    description:     `Invoice ${invoiceNumber}`,
                    invoiceNumber,
                    tenantSecretKey: decryptedSecret,
                  });

                  if (linkResult) {
                    paymentLink = linkResult.url;
                    providerPaymentLinkId = linkResult.linkId;
                    providerGateway = 'STRIPE';
                  }
                } catch (stripeErr) {
                  console.error('[cron] Stripe link failed:', stripeErr);
                }
              }
            }

            // C. GENERATE PHYSICAL PDF
            const relativePdfPath = await generateRetainerPDF(
              workspaceId, 
              retainer, 
              profile, 
              invoiceNumber, 
              billingMonth, 
              invoiceServices,
              totals,
              paymentLink
            );
            // Track for cleanup in case the DB transaction below fails and we
            // must retry with a new (different) invoice number.
            lastGeneratedPdfPath = relativePdfPath;

            // D. EXECUTE DATABASE TRANSACTION
            await prisma.$transaction(async (tx) => {
              const newInvoice = await tx.invoice.create({
                data: {
                  workspaceId,
                  clientId: retainer.clientId,
                  invoiceNumber,
                  financialYear: fy,
                  billingMonth,
                  invoiceDate: today,
                  clientName: retainer.client.name,
                  serviceDescription: baseDescription,
                  subtotal: toDecimal(totals.subtotal).toDecimalPlaces(2),
                  taxRate: totals.taxRate,
                  taxAmount: toDecimal(totals.taxAmount).toDecimalPlaces(2),
                  grandTotal: toDecimal(totals.total).toDecimalPlaces(2),
                  taxMode: totals.taxMode,
                  totalAmount: toDecimal(totals.total).toDecimalPlaces(2),
                  status: "PENDING",
                  pdfPath: relativePdfPath, 
                  providerGateway,
                  providerPaymentLinkId,
                  items: {
                    create: rawServices.map(s => ({
                      description: s.title,
                      quantity: 1,
                      unitPrice: toDecimal(s.amount),
                      totalAmount: toDecimal(s.amount),
                      taxRate: s.taxRate,
                      sacCode: s.sacCode,
                    }))
                  }
                } as any
              });

              if (retainer.meteredUsages.length > 0) {
                await tx.meteredUsage.updateMany({
                  where: { id: { in: retainer.meteredUsages.map((u: any) => u.id) } },
                  data: { status: "BILLED", billedInInvoiceId: newInvoice.id }
                });
              }

              let nextDate = new Date(retainer.nextBillingDate);
              const wasLastDay = isLastDayOfMonth(nextDate);

              if (retainer.frequency === 'MONTHLY') nextDate = addMonths(nextDate, 1);
              else if (retainer.frequency === 'QUARTERLY') nextDate = addMonths(nextDate, 3);
              else if (retainer.frequency === 'ANNUALLY') nextDate = addYears(nextDate, 1);

              if (wasLastDay) nextDate = endOfMonth(nextDate);
              if (isWeekend(nextDate)) nextDate = previousFriday(nextDate);          
              
              await tx.retainer.update({
                where: { id: retainer.id },
                data: { nextBillingDate: nextDate }
              });
            });

            success = true;

            results.successful++;
            results.logs.push(`Successfully billed ${retainer.client.name} for ${baseDescription}`);

            dispatchNotification({
              event: 'INVOICE_GENERATED',
              workspaceId,
              data: {
                invoiceNumber,
                clientName: retainer.client.name,
                amount: `${profile.workspace?.baseCurrency || 'INR'} ${totals.total.toFixed(2)}`,
                pdfUrl: relativePdfPath,
              },
            }).catch(() => null);

          } catch (err: any) {
            // Delete the PDF we just generated — it will be orphaned if we retry
            // with a new invoice number, or if we give up after MAX_ATTEMPTS.
            if (lastGeneratedPdfPath) {
              const fullOrphanPath = require('path').join(process.cwd(), 'public', lastGeneratedPdfPath.replace(/^\//, ''));
              try { require('fs').unlinkSync(fullOrphanPath); } catch (_) { /* ignore */ }
              lastGeneratedPdfPath = null;
            }
            if (err.code === 'P2002') {
              attempts++;
              if (attempts >= MAX_ATTEMPTS) {
                throw new Error("Unable to generate invoice. Please try again later.");
              }
              continue;
            }
            throw err;
          }
        }

      } catch (err: any) {
        console.error(`Failed to process retainer ${retainer.id}:`, err);
        results.failed++;
        results.logs.push(`FAILED: ${retainer.client.name} - ${err.message}`);
        dispatchNotification({
          event: "BILLING_FAILED",
          workspaceId: retainer.workspaceId,
          data: {
            clientName: retainer.client.name,
            message: err.message || "An unexpected error occurred during automated billing.",
          }
        }).catch(() => null);
        results.logs.push(`FAILED: ${retainer.client.name} - ${err.message}`);
      }
    }

    // 4. RETURN SUMMARY REPORT
    return NextResponse.json({
      message: "Cron execution complete",
      stats: {
        processed: dueRetainers.length,
        successful: results.successful,
        failed: results.failed
      },
      logs: results.logs
    });

  } catch (error) {
    console.error("Cron Execution Error:", error);
    return NextResponse.json({ error: "Failed to execute automated billing" }, { status: 500 });
  }
}
