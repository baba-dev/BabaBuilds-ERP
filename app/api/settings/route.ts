import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { decrypt, encrypt } from '@/lib/encryption';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { scanBuffer } from '@/lib/security/clamav';
import {
  ensureDir,
  sanitizeFilename,
  sniffAllowedContent,
  uniqueStoredName,
  buildPrivatePath,
} from '@/lib/uploads/private-storage';
import { isSupportedLocale } from '@/i18n/locales';
import { getTaxFeatureFlags } from '@/lib/tax/feature-flags';
import { logActivity } from '@/lib/security/activity-log';
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import { withPermission } from '@/lib/rbac';
import { canUsePaymentGateways, loadWorkspaceBillingSnapshot, shouldApplyFreeTierLimits } from '@/lib/entitlements';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.workspaceId;
    const locale = session.locale || "en-IN";

    const profile = await prisma.businessProfile.findUnique({ 
      where: { workspaceId },
      include: { workspace: true },  // Need planTier for UI gating
    });

    if (profile) {
      // ── SECRETS SCRUB: Never send raw values to the frontend ──────────────
      profile.smtpPassword  = "";
      
      if (profile.groqApiKey) {
        (profile as Record<string, unknown>).groqApiKey = "SET";
      }

      // Return a boolean-like masked string so the UI knows a secret is set
      if (profile.razorpayKeySecret) {
        (profile as Record<string, unknown>).razorpayKeySecret = "SET";
      }
      if ((profile as Record<string, unknown>).stripeSecretKey) {
        (profile as Record<string, unknown>).stripeSecretKey = "SET";
      }
    }
    
    const workspace = profile?.workspace;
    const planTier    = workspace?.planTier    ?? "FREE";
    const countryCode = workspace?.countryCode ?? "IN";
    const taxFeatureFlags = getTaxFeatureFlags({
      workspaceId,
      workspaceName: workspace?.name ?? null,
    });

    const billing = await loadWorkspaceBillingSnapshot(workspaceId);
    const billingEntitlements = {
      canUsePaymentGateways: billing ? canUsePaymentGateways(billing) : false,
      shouldApplyFreeTierLimits: billing ? shouldApplyFreeTierLimits(billing) : true,
    };

    // Strip the nested workspace object before returning (cleaner payload)
    const { workspace: _workspace, ...safeProfile } = (profile as Record<string, unknown> & { workspace: unknown }) ?? {};
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ignore = _workspace; 

    return NextResponse.json({
      ...safeProfile,
      locale,
      planTier,
      subscriptionStatus: workspace?.subscriptionStatus ?? "FREE",
      subscriptionEndsAt: workspace?.subscriptionEndsAt?.toISOString() ?? null,
      countryCode,
      taxFeatureFlags,
      billingEntitlements,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let workspaceId = "";
  let actorId: string | null = null;
  let actorEmail: string | null = null;
  let changedFieldNames: string[] = [];

  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    workspaceId = session.workspaceId;
    actorId = session.user?.id ?? null;
    actorEmail = session.user?.email ?? null;

    // RBAC: changing workspace settings requires workspace.manage_settings permission
    if (actorId) {
      const perm = await withPermission(actorId, workspaceId, 'workspace.manage_settings');
      if (!perm.granted) return perm.response;
    }

    const formData = await request.formData();

    const hasField = (field: string) => formData.has(field);
    const getStringField = (field: string) => {
      const value = formData.get(field);
      return typeof value === 'string' ? value : null;
    };
    const getNullableFromClearableField = (field: string) => {
      const value = getStringField(field);
      if (value === null) return null;
      return value.trim() === '' ? null : value;
    };
    
    // ── Core fields ──────────────────────────────────────────────────────────
    const companyName    = formData.get('companyName')    as string;
    const proprietorName = formData.get('proprietorName') as string;
    const address        = formData.get('address')        as string;
    const email          = formData.get('email')          as string;
    const phone          = getStringField('phone');
    const website        = getStringField('website');
    const panNumber      = formData.get('panNumber')      as string;
    const udyamNumber    = getStringField('udyamNumber');
    const gstin          = getStringField('gstin');
    const bankName       = formData.get('bankName')       as string;
    const accountName    = formData.get('accountName')    as string;
    const accountNumber  = formData.get('accountNumber')  as string;
    const ifscCode       = formData.get('ifscCode')       as string;
    const smtpHost       = getStringField('smtpHost');
    const smtpPortRaw    = getStringField('smtpPort');
    const smtpPort       = smtpPortRaw ? parseInt(smtpPortRaw) : null;
    const smtpUser       = getStringField('smtpUser');
    const smtpFromEmail  = getStringField('smtpFromEmail');
    const defaultSacCode = (formData.get('defaultSacCode') as string) || "998313";
    const invoiceTheme   = (formData.get('invoiceTheme')  as string) || "DESIGN_1";
    const clientLocale   = formData.get('locale')         as string;

    if (clientLocale && !isSupportedLocale(clientLocale)) {
      return NextResponse.json({ error: 'Invalid locale selection' }, { status: 400 });
    }

    // ── SECRETS INTERCEPTION ─────────────────────────────────────────────────
    const rawSmtpPassword         = formData.get('smtpPassword')         as string;
    const rawGroqApiKey           = formData.get('groqApiKey')           as string;
    const rawRzpKeyId             = getStringField('razorpayKeyId');
    const rawRzpSecret            = formData.get('razorpayKeySecret')    as string;
    const rawStripePublishableKey = getStringField('stripePublishableKey');
    const rawStripeSecretKey      = formData.get('stripeSecretKey')      as string;
    const defaultGateway          = formData.get('defaultGateway')       as string;

    // ── Shop / E-Store fields ─────────────────────────────────────────────────
    const rawShopSlug        = getStringField('shopSlug');
    const shopTagline        = getStringField('shopTagline');
    const shopEnabledRaw     = formData.get('shopEnabled');
    const shopEnabled        = shopEnabledRaw === 'true' ? true : shopEnabledRaw === 'false' ? false : undefined;
    const shopAccentColor    = getStringField('shopAccentColor');

    // Validate + normalize slug
    let shopSlug: string | null | undefined = undefined;
    if (rawShopSlug !== null) {
      const normalized = rawShopSlug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (normalized && normalized.length >= 3) {
        // Uniqueness check — ignore current workspace
        const existing = await prisma.businessProfile.findFirst({
          where: { shopSlug: normalized, NOT: { workspaceId } },
        });
        if (existing) {
          return NextResponse.json({ error: 'That shop URL is already taken. Please choose a different one.' }, { status: 409 });
        }
        shopSlug = normalized;
      } else if (normalized === '') {
        shopSlug = null; // Clear slug
      }
    }

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
        return NextResponse.json({ error: "Invalid file type. Only PNG, JPG, or WEBP allowed." }, { status: 400 });
      }
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const detected = sniffAllowedContent(buffer);
      if (!detected || !['png', 'jpeg', 'webp', 'gif'].includes(detected)) {
        return NextResponse.json({ error: "Invalid image data. Please upload a real PNG/JPG/WEBP." }, { status: 400 });
      }

      const isSafe = await scanBuffer(buffer);
      if (!isSafe) {
        return NextResponse.json({ error: "Malware detected in uploaded file." }, { status: 400 });
      }

      const storedName = uniqueStoredName('logo', ext);
      const absPath = buildPrivatePath('logos', [workspaceId, storedName]);
      await ensureDir(path.dirname(absPath));
      await fs.promises.writeFile(absPath, buffer, { mode: 0o600 });
      logoUrl = `/logos/${workspaceId}/${storedName}`;
    }

    if (signatureFile && signatureFile.size > 0) {
      const ext = path.extname(signatureFile.name).toLowerCase();
      const allowedExtensions = ['.png', '.webp'];
      if (!allowedExtensions.includes(ext)) {
        return NextResponse.json({ error: "Invalid signature type. Only PNG or WEBP allowed." }, { status: 400 });
      }
      const bytes = await signatureFile.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const detected = sniffAllowedContent(buffer);
      if (!detected || !['png', 'webp'].includes(detected)) {
        return NextResponse.json({ error: "Invalid signature image data. Please upload a real PNG/WEBP." }, { status: 400 });
      }

      const isSafe = await scanBuffer(buffer);
      if (!isSafe) {
        return NextResponse.json({ error: "Malware detected in uploaded signature." }, { status: 400 });
      }

      const storedName = uniqueStoredName('signature', ext);
      const absPath = buildPrivatePath('signatures', [workspaceId, storedName]);
      await ensureDir(path.dirname(absPath));
      await fs.promises.writeFile(absPath, buffer, { mode: 0o600 });
      signatureUrl = `/signatures/${workspaceId}/${storedName}`;
    }

    // ── Build update payload (no secrets yet) ─────────────────────────────────
    const updateData: Record<string, unknown> = {
      companyName, proprietorName, address, email, phone, website,
      panNumber, udyamNumber, gstin,
      bankName, accountName, accountNumber, ifscCode,
      smtpHost, smtpPort, smtpUser, smtpFromEmail,
      invoiceTheme, defaultSacCode,
      ...(logoUrl && { logoUrl }),
      ...(signatureUrl !== undefined && { signatureUrl }),
      // E-Store shop fields
      ...(shopSlug       !== undefined && { shopSlug }),
      ...(shopTagline    !== null       && { shopTagline:    shopTagline    || null }),
      ...(shopEnabled    !== undefined  && { shopEnabled }),
      ...(shopAccentColor !== null      && { shopAccentColor: shopAccentColor || '#6366f1' }),
    };

    /**
     * Clearable optional fields:
     * - If omitted from request => no change
     * - If present but empty => persist null
     */
    if (hasField('phone')) updateData.phone = getNullableFromClearableField('phone');
    else delete updateData.phone;

    if (hasField('website')) updateData.website = getNullableFromClearableField('website');
    else delete updateData.website;

    if (hasField('udyamNumber')) updateData.udyamNumber = getNullableFromClearableField('udyamNumber');
    else delete updateData.udyamNumber;

    if (hasField('gstin')) updateData.gstin = getNullableFromClearableField('gstin');
    else delete updateData.gstin;

    if (hasField('smtpHost')) updateData.smtpHost = getNullableFromClearableField('smtpHost');
    else delete updateData.smtpHost;

    if (hasField('smtpUser')) updateData.smtpUser = getNullableFromClearableField('smtpUser');
    else delete updateData.smtpUser;

    if (hasField('smtpFromEmail')) updateData.smtpFromEmail = getNullableFromClearableField('smtpFromEmail');
    else delete updateData.smtpFromEmail;

    if (hasField('smtpPort')) {
      updateData.smtpPort = smtpPortRaw && smtpPortRaw.trim() !== '' ? smtpPort : null;
    } else {
      delete updateData.smtpPort;
    }

    // Append SMTP / Groq secrets only if user typed a new value or deleted them
    if (rawSmtpPassword && rawSmtpPassword !== "SET") {
      if (rawSmtpPassword === "DELETE_KEY") {
        updateData.smtpPassword = null;
      } else {
        updateData.smtpPassword = encrypt(rawSmtpPassword);
      }
    } else {
      const existingProfile = await prisma.businessProfile.findUnique({
        where: { workspaceId },
        select: { smtpPassword: true },
      });
      const existingSmtpPassword = existingProfile?.smtpPassword;

      // Legacy fallback: plaintext passwords remain usable at runtime.
      // On the next save, auto-re-encrypt plaintext values.
      if (existingSmtpPassword) {
        try {
          decrypt(existingSmtpPassword);
        } catch {
          updateData.smtpPassword = encrypt(existingSmtpPassword);
        }
      }
    }
    
    if (rawGroqApiKey && rawGroqApiKey !== "SET") {
      if (rawGroqApiKey === "DELETE_KEY") {
        updateData.groqApiKey = null;
      } else {
        updateData.groqApiKey = encrypt(rawGroqApiKey);
      }
    }

    // ── Razorpay secrets ──────────────────────────────────────────────────────
    // Key ID is publishable — store plain (or null if cleared)
    if (hasField('razorpayKeyId')) {
      updateData.razorpayKeyId = rawRzpKeyId && rawRzpKeyId.trim() !== '' ? rawRzpKeyId : null;
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
    if (hasField('stripePublishableKey')) {
      updateData.stripePublishableKey = rawStripePublishableKey && rawStripePublishableKey.trim() !== '' ? rawStripePublishableKey : null;
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
        smtpPassword:
          parsedSmtpPassword && parsedSmtpPassword !== "SET"
            ? encrypt(parsedSmtpPassword)
            : null,
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
      (profile as Record<string, unknown>).smtpPassword = "";
      (profile as Record<string, unknown>).groqApiKey = profile.groqApiKey ? "SET" : "";
      (profile as Record<string, unknown>).razorpayKeySecret = profile.razorpayKeySecret ? "SET" : "";
      (profile as Record<string, unknown>).stripeSecretKey = (profile as Record<string, unknown>).stripeSecretKey ? "SET" : "";
    }

    // ── Locale update ─────────────────────────────────────────────────────────
    if (clientLocale) {
      const userId = session?.user?.id;
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data:  { locale: clientLocale },
        });
      }
      const cookieStore = await cookies();
      cookieStore.set('NEXT_LOCALE', clientLocale, { path: '/' });
    }

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'businessProfile', action: 'update' });
    }

    changedFieldNames = Object.keys(updateData).sort();
    if (clientLocale) {
      changedFieldNames.push('locale');
    }

    logActivity({
      action: "settings_update",
      status: "SUCCESS",
      workspaceId,
      actor: { userId: actorId, email: actorEmail },
      entity: { type: "workspace_settings", id: workspaceId },
      metadata: {
        changedFieldNames,
        changedFieldCount: changedFieldNames.length,
      },
      request,
    });

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error(error);
    logActivity({
      action: "settings_update",
      status: "FAILURE",
      workspaceId: workspaceId || null,
      actor: { userId: actorId, email: actorEmail },
      entity: { type: "workspace_settings", id: workspaceId || null },
      metadata: {
        changedFieldNames,
        changedFieldCount: changedFieldNames.length,
        error: String(error)
      },
      request,
    });
    return NextResponse.json({ error: 'Failed to save business profile' }, { status: 500 });
  }
}
