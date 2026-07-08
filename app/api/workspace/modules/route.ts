/**
 * app/api/workspace/modules/route.ts
 *
 * GET  — returns enabled modules for the current workspace
 * POST — toggles a module on/off (requires workspace.manage_settings permission)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { enableMultiCompany } from '@/lib/company-groups/enable-multi-company';
import {
  enableModule,
  disableModule,
  getEnabledModules,
  isValidModuleKey,
} from '@/lib/modules';

async function getWorkspaceId(userId: string, sessionWorkspaceId?: string | null): Promise<string | null> {
  if (sessionWorkspaceId) {
    const membership = await prisma.workspaceUser.findFirst({
      where: { userId, workspaceId: sessionWorkspaceId, isActive: true },
      select: { workspaceId: true },
    });
    if (membership) return membership.workspaceId;
  }

  const wu = await prisma.workspaceUser.findFirst({
    where: { userId, isActive: true },
    select: { workspaceId: true },
    orderBy: { joinedAt: 'asc' },
  });
  return wu?.workspaceId ?? null;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = await getWorkspaceId(session.user.id, (session as { workspaceId?: string | null }).workspaceId);
    if (!workspaceId) {
      return NextResponse.json({ modules: [] });
    }

    const enabled = await getEnabledModules(workspaceId);
    return NextResponse.json({ modules: Array.from(enabled) });
  } catch (err) {
    console.error('[modules/GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = await getWorkspaceId(session.user.id, (session as { workspaceId?: string | null }).workspaceId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    // Require workspace settings permission
    try {
      await requirePermission(session.user.id, workspaceId, 'workspace.manage_settings');
    } catch (err) {
      if (err instanceof RbacDeniedError) return rbacDeniedResponse(err);
      throw err;
    }

    const body = await req.json() as { moduleKey?: string; enabled?: boolean };
    const { moduleKey, enabled } = body;

    if (!moduleKey || !isValidModuleKey(moduleKey)) {
      return NextResponse.json({ error: 'Invalid moduleKey' }, { status: 400 });
    }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }

    if (enabled) {
      if (moduleKey === 'MULTI_COMPANY') {
        await enableMultiCompany(workspaceId, session.user.id);
      } else {
        await enableModule(workspaceId, moduleKey, session.user.id);
      }
    } else {
      await disableModule(workspaceId, moduleKey, session.user.id);
    }

    return NextResponse.json({ success: true, moduleKey, enabled });
  } catch (err) {
    console.error('[modules/POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
