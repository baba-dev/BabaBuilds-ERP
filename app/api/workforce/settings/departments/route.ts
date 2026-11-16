/**
 * app/api/workforce/settings/departments/route.ts
 * GET  — list departments
 * POST — create a department
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { requireModule, ModuleDisabledError } from '@/lib/modules';
import { resolveSessionMembership } from '@/lib/workspace-scope';

// The workspace the user is in (session), not an arbitrary membership.
async function getWid(session: Parameters<typeof resolveSessionMembership>[0]) {
  return (await resolveSessionMembership(session))?.workspaceId ?? null;
}

export async function GET(__req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const wid = await getWid(session);
    if (!wid) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

    try {
      await requireModule(wid, 'WORKFORCE');
      await requirePermission(session.user.id, wid, 'workforce.view');
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const departments = await prisma.department.findMany({
      where: { workspaceId: wid },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ departments });
  } catch (err) {
    console.error('[departments/GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const wid = await getWid(session);
    if (!wid) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

    try {
      await requireModule(wid, 'WORKFORCE');
      await requirePermission(session.user.id, wid, 'workforce.settings.manage');
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const { name, description } = await req.json() as { name?: string; description?: string };
    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const dept = await prisma.department.create({ data: { workspaceId: wid, name: name.trim(), description } });
    return NextResponse.json(dept, { status: 201 });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') return NextResponse.json({ error: 'That name already exists.' }, { status: 409 });
    console.error('[departments/POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
