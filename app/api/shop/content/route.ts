import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac';
import { isModuleEnabled } from '@/lib/modules';
import { logActivity } from '@/lib/security/activity-log';
import {
  buildShopContentUpdate,
  readShopContent,
  EMPTY_SHOP_CONTENT,
} from '@/lib/shop/content';

type SessionContext = {
  workspaceId?: string;
  user?: { id?: string | null; email?: string | null };
};

/**
 * GET /api/shop/content
 * Returns the structured shop content blocks for the authenticated workspace.
 * Read access is gated on `shop.view`.
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

  const profile = await prisma.businessProfile.findUnique({
    where: { workspaceId },
    select: {
      shopAnnouncement: true,
      shopAboutMd: true,
      shopFooterNote: true,
      shopSocialJson: true,
      shopFaqJson: true,
      shopShowAiAssist: true,
    },
  });

  const content = profile ? readShopContent(profile) : EMPTY_SHOP_CONTENT;
  return NextResponse.json({ content });
}

/**
 * PATCH /api/shop/content
 * Accepts a partial JSON body with the keys `announcement`, `aboutMd`,
 * `footerNote`, `social[]`, `faq[]`, `showAiAssist`. All fields are optional —
 * only included keys are updated.
 *
 * Requires `shop.content.manage`.
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

  const perm = await withPermission(userId, workspaceId, 'shop.content.manage');
  if (!perm.granted) return perm.response;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const patch = buildShopContentUpdate(body);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No supported fields provided.' }, { status: 400 });
  }

  const existing = await prisma.businessProfile.findUnique({
    where: { workspaceId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: 'Business profile not found. Complete settings first.' },
      { status: 404 },
    );
  }

  const updated = await prisma.businessProfile.update({
    where: { workspaceId },
    data: patch,
    select: {
      shopAnnouncement: true,
      shopAboutMd: true,
      shopFooterNote: true,
      shopSocialJson: true,
      shopFaqJson: true,
      shopShowAiAssist: true,
    },
  });

  logActivity({
    action: 'shop_content_update',
    status: 'SUCCESS',
    workspaceId,
    actor: { userId, email: session.user?.email ?? null },
    entity: { type: 'shop_content', id: workspaceId },
    metadata: { changedFields: Object.keys(patch) },
    request,
  }).catch(() => null);

  return NextResponse.json({ content: readShopContent(updated) });
}
