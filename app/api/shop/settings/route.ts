import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac';
import { isModuleEnabled } from '@/lib/modules';
import { logActivity } from '@/lib/security/activity-log';

type SessionContext = {
  workspaceId?: string;
  user?: { id?: string | null; email?: string | null };
};

function normalizeSlug(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!normalized) return null;
  return normalized.length >= 3 ? normalized : null;
}

/**
 * GET /api/shop/settings
 * Narrow shop-settings endpoint used by shop dashboards and AI tools.
 * Guarded by shop.view (read access to shop configuration).
 */
export async function GET() {
  const session = (await getServerSession(authOptions)) as SessionContext | null;
  if (!session?.workspaceId || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = session.workspaceId;
  const userId = session.user.id;

  if (!(await isModuleEnabled(workspaceId, 'SHOP'))) {
    return NextResponse.json(
      { error: 'Shop module is disabled for this workspace.', code: 'SHOP_MODULE_DISABLED' },
      { status: 409 },
    );
  }

  const perm = await withPermission(userId, workspaceId, 'shop.view');
  if (!perm.granted) return perm.response;

  const [profile, listed] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { workspaceId },
      select: {
        shopEnabled: true,
        shopSlug: true,
        shopTagline: true,
        shopAccentColor: true,
        razorpayKeyId: true,
        razorpayKeySecret: true,
        stripePublishableKey: true,
        stripeSecretKey: true,
        defaultGateway: true,
        smtpHost: true,
        smtpUser: true,
        smtpPassword: true,
        gstRegistrationType: true,
      },
    }),
    prisma.product.count({ where: { workspaceId, showInShop: true, archivedAt: null } }),
  ]);

  const razorpay = Boolean(profile?.razorpayKeyId && profile?.razorpayKeySecret);
  const stripe = Boolean(profile?.stripePublishableKey && profile?.stripeSecretKey);
  return NextResponse.json({
    shopEnabled: profile?.shopEnabled ?? false,
    shopSlug: profile?.shopSlug ?? null,
    shopTagline: profile?.shopTagline ?? null,
    shopAccentColor: profile?.shopAccentColor ?? '#6366f1',
    // Whether the shop can take money and email customers, without exposing any secret.
    readiness: {
      gateway: razorpay || stripe ? (razorpay && profile?.defaultGateway !== 'STRIPE' ? 'RAZORPAY' : 'STRIPE') : null,
      email: Boolean(profile?.smtpHost && profile?.smtpUser && profile?.smtpPassword),
      listedProducts: listed,
      gstRegistrationType: profile?.gstRegistrationType ?? null,
    },
  });
}

/**
 * PATCH /api/shop/settings
 * Update only shop settings (toggle/slug/tagline/accent), separate from full
 * workspace settings, and protected by shop.settings.manage.
 */
export async function PATCH(request: Request) {
  const session = (await getServerSession(authOptions)) as SessionContext | null;
  if (!session?.workspaceId || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = session.workspaceId;
  const userId = session.user.id;

  if (!(await isModuleEnabled(workspaceId, 'SHOP'))) {
    return NextResponse.json(
      { error: 'Shop module is disabled for this workspace.', code: 'SHOP_MODULE_DISABLED' },
      { status: 409 },
    );
  }

  const perm = await withPermission(userId, workspaceId, 'shop.settings.manage');
  if (!perm.granted) return perm.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }
  const patch = body as Record<string, unknown>;
  const updateData: Record<string, unknown> = {};

  if ('shopEnabled' in patch && typeof patch.shopEnabled === 'boolean') {
    updateData.shopEnabled = patch.shopEnabled;
  }
  if ('shopTagline' in patch) {
    if (typeof patch.shopTagline === 'string') {
      const trimmed = patch.shopTagline.trim();
      updateData.shopTagline = trimmed ? trimmed.slice(0, 180) : null;
    } else if (patch.shopTagline === null) {
      updateData.shopTagline = null;
    }
  }
  if ('shopAccentColor' in patch && typeof patch.shopAccentColor === 'string') {
    const normalized = patch.shopAccentColor.trim();
    // Simple hex guard; fallback to default if malformed.
    updateData.shopAccentColor = /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : '#6366f1';
  }
  if ('shopSlug' in patch) {
    const candidate = typeof patch.shopSlug === 'string' ? patch.shopSlug : '';
    const normalized = normalizeSlug(candidate);
    if (candidate.trim() !== '' && !normalized) {
      return NextResponse.json(
        { error: 'Shop slug must be at least 3 characters and contain only a-z, 0-9, and hyphens.' },
        { status: 400 },
      );
    }
    if (normalized) {
      const existing = await prisma.businessProfile.findFirst({
        where: { shopSlug: normalized, NOT: { workspaceId } },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: 'That shop URL is already taken. Please choose a different one.' },
          { status: 409 },
        );
      }
    }
    updateData.shopSlug = normalized;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No supported fields provided.' }, { status: 400 });
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { workspaceId },
    select: { id: true },
  });
  if (!profile) {
    return NextResponse.json(
      { error: 'Business profile not found. Complete workspace settings first.' },
      { status: 404 },
    );
  }

  const updated = await prisma.businessProfile.update({
    where: { workspaceId },
    data: updateData,
    select: {
      shopEnabled: true,
      shopSlug: true,
      shopTagline: true,
      shopAccentColor: true,
    },
  });

  logActivity({
    action: 'shop_settings_update',
    status: 'SUCCESS',
    workspaceId,
    actor: { userId, email: session.user?.email ?? null },
    entity: { type: 'shop_settings', id: workspaceId },
    metadata: { changedFields: Object.keys(updateData).sort() },
    request,
  }).catch(() => null);

  return NextResponse.json(updated);
}
