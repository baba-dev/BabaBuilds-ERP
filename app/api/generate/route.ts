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

const lookupAsync = promisify(dns.lookup);
const ALLOWED_STATUSES = ["Pending", "Partially Paid", "Paid"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

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


export async function POST(request: Request) {
  let generatedPdfPath = ""; 

  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const body = await request.json();
    const { clientId, billingMonth, sacCode, services, customDate, sendEmail, status: rawStatus } = body;
    const normalizedStatus = normalizeInvoiceStatus(rawStatus);

    if (!clientId) return NextResponse.json({ error: "No client selected." }, { status: 400 });
    if (!Array.isArray(services) || services.length === 0) {
      return NextResponse.json({ error: "No services provided." }, { status: 400 });
    }
    
    // --- 🚨 SECURITY PATCH: Prevent NaN Poisoning ---
    const sanitizedServices = services.map((s: any) => {
      const amt = Number(s.amount);
      if (isNaN(amt) || amt < 0) {
        throw new Error(`Invalid amount detected for service: ${s.title}`);
      }
      return { ...s, amount: amt };
    });

    const totalAmount = sanitizedServices.reduce((sum: number, service: any) => sum + service.amount, 0);
    const serviceDesc = sanitizedServices.map((s: any) => s.title).join(" + ");

    // --- 🚨 SECURITY PATCH: Prevent Double-Click Race Conditions (Idempotency) ---
    const recentDuplicate = await prisma.invoice.findFirst({
      where: {
        workspaceId,
        clientId,
        totalAmount,
        serviceDescription: serviceDesc,
        createdAt: { gte: new Date(Date.now() - 60 * 1000) }
      }
    });

    if (recentDuplicate) {
      return NextResponse.json({ 
        error: "Duplicate request detected. An identical invoice was generated less than a minute ago." 
      }, { status: 429 });
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

    const isFreePlan     = profile.workspace?.planTier === "FREE";
    const isProPlan      = !isFreePlan;
    const userLocale     = profile.workspace?.countryCode === "IN" ? "en-IN" : "en-US";
    const invoiceTheme   = (profile as any).invoiceTheme || "DESIGN_1";
    const baseCurrency   = profile.workspace?.baseCurrency || 'INR';

    const date    = customDate ? new Date(customDate) : new Date();
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 7);

    const formattedTotal = totalAmount.toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const currentMonth = date.getMonth() + 1; 
    const currentYear  = date.getFullYear();
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
                amount:          totalAmount,
                currency:        baseCurrency,
                description:     `Invoice ${invoiceNumber}`,
                invoiceDueDate:  dueDate,
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
                amount:          totalAmount,    // in major units — service converts to smallest unit internally
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
          date,
          dueDate,
          billingMonth,
          sacCode,
          services: sanitizedServices,
          totalAmount,
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
            invoiceNumber, financialYear: fy, billingMonth, invoiceDate: date, 
            clientName: client.name, clientId: client.id,
            sacCode: typeof sacCode === 'string' ? sacCode : JSON.stringify(sacCode), 
            serviceDescription: serviceDesc, 
            totalAmount,
            pdfPath: relativePdfPath,
            status: normalizedStatus,
          },
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

    return NextResponse.json({
      success: true,
      invoice: newInvoice,
      status: newInvoice.status,
      emailStatus
    });

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

    return NextResponse.json({ error: error.message || 'Failed to generate invoice' }, { status: 400 });
  }
}
