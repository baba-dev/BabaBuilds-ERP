import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { encrypt } from '@/lib/encryption';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { scanBuffer } from '@/lib/security/clamav';
import { isSupportedLocale } from '@/i18n/locales';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = (session as any).workspaceId;
    const locale = (session as any).locale || "en-IN";

    const profile = await prisma.businessProfile.findUnique({ 
      where: { workspaceId },
      include: { workspace: true },  // Need planTier for UI gating
    });

    if (profile) {
      // ── SECRETS SCRUB: Never send raw values to the frontend ──────────────
      profile.smtpPassword  = "";
      
      if (profile.groqApiKey) {
        (profile as any).groqApiKey = "SET";
      }

      // Return a boolean-like masked string so the UI knows a secret is set
      if (profile.razorpayKeySecret) {
        (profile as any).razorpayKeySecret = "SET";
      }
      if ((profile as any).stripeSecretKey) {
        (profile as any).stripeSecretKey = "SET";
      }
    }
    
    const planTier    = (profile as any)?.workspace?.planTier    ?? "FREE";
    const countryCode = (profile as any)?.workspace?.countryCode ?? "IN";

    // Strip the nested workspace object before returning (cleaner payload)
    const { workspace: _ws, ...safeProfile } = (profile as any) ?? {};

    return NextResponse.json({ ...safeProfile, locale, planTier, countryCode });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = (session as any).workspaceId;
    const formData = await request.formData();
    
    // ── Core fields ──────────────────────────────────────────────────────────
    const companyName    = formData.get('companyName')    as string;
    const proprietorName = formData.get('proprietorName') as string;
    const address        = formData.get('address')        as string;
    const email          = formData.get('email')          as string;
    const phone          = formData.get('phone')          as string;
    const website        = formData.get('website')        as string;
    const panNumber      = formData.get('panNumber')      as string;
    const udyamNumber    = formData.get('udyamNumber')    as string;
    const gstin          = formData.get('gstin')          as string;
    const bankName       = formData.get('bankName')       as string;
    const accountName    = formData.get('accountName')    as string;
    const accountNumber  = formData.get('accountNumber')  as string;
    const ifscCode       = formData.get('ifscCode')       as string;
    const smtpHost       = formData.get('smtpHost')       as string;
    const smtpPort       = formData.get('smtpPort') ? parseInt(formData.get('smtpPort') as string) : null;
    const smtpUser       = formData.get('smtpUser')       as string;
    const smtpFromEmail  = formData.get('smtpFromEmail')  as string;
    const defaultSacCode = (formData.get('defaultSacCode') as string) || "998313";
    const invoiceTheme   = (formData.get('invoiceTheme')  as string) || "DESIGN_1";
    const clientLocale   = formData.get('locale')         as string;

    if (clientLocale && !isSupportedLocale(clientLocale)) {
      return NextResponse.json({ error: 'Invalid locale selection' }, { status: 400 });
    }

    // ── SECRETS INTERCEPTION ─────────────────────────────────────────────────
    const rawSmtpPassword         = formData.get('smtpPassword')         as string;
    const rawGroqApiKey           = formData.get('groqApiKey')           as string;
    const rawRzpKeyId             = formData.get('razorpayKeyId')        as string;
    const rawRzpSecret            = formData.get('razorpayKeySecret')    as string;
    const rawStripePublishableKey = formData.get('stripePublishableKey') as string;
    const rawStripeSecretKey      = formData.get('stripeSecretKey')      as string;
    const defaultGateway          = formData.get('defaultGateway')       as string;

    // "DELETE_KEY" sentinel means the user explicitly cleared the secret
    const parsedSmtpPassword = rawSmtpPassword === "DELETE_KEY" ? null : rawSmtpPassword;
    const parsedGroqApiKey   = rawGroqApiKey   === "DELETE_KEY" ? null : rawGroqApiKey;

    // ── Logo & Signature Upload ───────────────────────────────────────────────
    const file = formData.get('logo') as File | null;
    let logoUrl = formData.get('existingLogoUrl') as string | null;
    
    const signatureFile = formData.get('signature') as File | null;
    let signatureUrl = formData.get('existingSignatureUrl') as string | null;

    if (logoUrl) {
      const isValidPrefix    = logoUrl.startsWith(`/logos/${workspaceId}/`);
      const containsTraversal = logoUrl.includes('..') || logoUrl.includes('%2e');
      if (!isValidPrefix || containsTraversal) logoUrl = null; 
    }

    if (signatureUrl) {
      const isValidPrefix    = signatureUrl.startsWith(`/signatures/${workspaceId}/`);
      const containsTraversal = signatureUrl.includes('..') || signatureUrl.includes('%2e');
      if (!isValidPrefix || containsTraversal) signatureUrl = null; 
    }

    if (file && file.size > 0) {
      const ext = path.extname(file.name).toLowerCase();
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp']; 
      if (!allowedExtensions.includes(ext)) {
        return NextResponse.json({ error: "Invalid file type. Only images are allowed." }, { status: 400 });
      }
      const bytes  = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      const isSafe = await scanBuffer(buffer);
      if (!isSafe) {
        return NextResponse.json({ error: "Malware detected in uploaded file." }, { status: 400 });
      }

      const dir      = path.join(process.cwd(), 'public', 'logos', workspaceId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `logo-${Date.now()}-${uuidv4()}${ext}`;
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, buffer);
      logoUrl = `/logos/${workspaceId}/${filename}`;
    }

    if (signatureFile && signatureFile.size > 0) {
      const ext = path.extname(signatureFile.name).toLowerCase();
      // Enforce transparent-friendly formats
      const allowedExtensions = ['.png', '.webp']; 
      if (!allowedExtensions.includes(ext)) {
        return NextResponse.json({ error: "Invalid signature type. Only transparent PNG or WEBP allowed." }, { status: 400 });
      }
      const bytes  = await signatureFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      const isSafe = await scanBuffer(buffer);
      if (!isSafe) {
        return NextResponse.json({ error: "Malware detected in uploaded signature." }, { status: 400 });
      }

      const dir      = path.join(process.cwd(), 'public', 'signatures', workspaceId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `signature-${Date.now()}-${uuidv4()}${ext}`;
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, buffer);
      signatureUrl = `/signatures/${workspaceId}/${filename}`;
    }

    // ── Build update payload (no secrets yet) ─────────────────────────────────
    const updateData: any = {
      companyName, proprietorName, address, email, phone, website,
      panNumber, udyamNumber, gstin,
      bankName, accountName, accountNumber, ifscCode,
      smtpHost, smtpPort, smtpUser, smtpFromEmail,
      invoiceTheme, defaultSacCode,
      ...(logoUrl && { logoUrl }),
      ...(signatureUrl !== undefined && { signatureUrl }),
    };

    // Append SMTP / Groq secrets only if user typed a new value or deleted them
    if (rawSmtpPassword) updateData.smtpPassword = parsedSmtpPassword;
    
    if (rawGroqApiKey && rawGroqApiKey !== "SET") {
      if (rawGroqApiKey === "DELETE_KEY") {
        updateData.groqApiKey = null;
      } else {
        updateData.groqApiKey = encrypt(rawGroqApiKey);
      }
    }

    // ── Razorpay secrets ──────────────────────────────────────────────────────
    // Key ID is publishable — store plain (or null if cleared)
    if (rawRzpKeyId !== null && rawRzpKeyId !== undefined) {
      updateData.razorpayKeyId = rawRzpKeyId || null;
    }

    // Key Secret: only update if user typed a real new value (not the "SET" mask, not "DELETE_KEY")
    if (rawRzpSecret && rawRzpSecret !== "SET") {
      if (rawRzpSecret === "DELETE_KEY") {
        updateData.razorpayKeySecret = null;
      } else {
        // Encrypt before storing
        updateData.razorpayKeySecret = encrypt(rawRzpSecret);
      }
    }

    // ── Stripe secrets ────────────────────────────────────────────────────────
    // Publishable key is non-secret — store plain (or null if cleared)
    if (rawStripePublishableKey !== null && rawStripePublishableKey !== undefined) {
      updateData.stripePublishableKey = rawStripePublishableKey || null;
    }

    // Secret key: only update if user typed a real new value (mirrors Razorpay pattern)
    if (rawStripeSecretKey && rawStripeSecretKey !== "SET") {
      if (rawStripeSecretKey === "DELETE_KEY") {
        updateData.stripeSecretKey = null;
      } else {
        updateData.stripeSecretKey = encrypt(rawStripeSecretKey);
      }
    }

    // Default gateway preference — plain string
    if (defaultGateway) {
      updateData.defaultGateway = defaultGateway;
    }

    // ── Upsert ────────────────────────────────────────────────────────────────
    const profile = await prisma.businessProfile.upsert({
      where:  { workspaceId },
      update: updateData,
      create: {
        workspaceId,
        companyName, proprietorName, address, email, phone, website,
        panNumber, udyamNumber, gstin,
        bankName, accountName, accountNumber, ifscCode,
        smtpHost, smtpPort, smtpUser, smtpFromEmail, 
        smtpPassword:        parsedSmtpPassword || null,
        groqApiKey:          (rawGroqApiKey && rawGroqApiKey !== "SET" && rawGroqApiKey !== "DELETE_KEY")
                               ? encrypt(rawGroqApiKey) : (parsedGroqApiKey || null),
        razorpayKeyId:       rawRzpKeyId        || null,
        razorpayKeySecret:   (rawRzpSecret && rawRzpSecret !== "SET" && rawRzpSecret !== "DELETE_KEY")
                               ? encrypt(rawRzpSecret) : null,
        stripePublishableKey: rawStripePublishableKey || null,
        stripeSecretKey:      (rawStripeSecretKey && rawStripeSecretKey !== "SET" && rawStripeSecretKey !== "DELETE_KEY")
                               ? encrypt(rawStripeSecretKey) : null,
        defaultGateway:       defaultGateway || "RAZORPAY",
        invoiceTheme, defaultSacCode, logoUrl, signatureUrl,
      },
    });

    if (profile) {
      // Re-scrub before returning to frontend
      profile.smtpPassword               = "";
      (profile as any).groqApiKey        = profile.groqApiKey ? "SET" : "";
      (profile as any).razorpayKeySecret = profile.razorpayKeySecret ? "SET" : "";
      (profile as any).stripeSecretKey   = (profile as any).stripeSecretKey ? "SET" : "";
    }

    // ── Locale update ─────────────────────────────────────────────────────────
    if (clientLocale) {
      const userId = (session?.user as any)?.id;
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data:  { locale: clientLocale },
        });
      }
      const cookieStore = await cookies();
      cookieStore.set('NEXT_LOCALE', clientLocale, { path: '/' });
    }

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save business profile' }, { status: 500 });
  }
}