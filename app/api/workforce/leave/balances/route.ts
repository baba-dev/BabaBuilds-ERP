/**
 * app/api/workforce/leave/balances/route.ts
 * GET — leave balances for an employee
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requirePermission, checkPermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { requireModule, ModuleDisabledError } from '@/lib/modules';
import { getEmployeeByUserId } from '@/lib/workforce/index';
import { resolveSessionMembership } from '@/lib/workspace-scope';

// The workspace the user is in (session), not an arbitrary membership.
async function getWid(session: Parameters<typeof resolveSessionMembership>[0]) {
  return (await resolveSessionMembership(session))?.workspaceId ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const wid = await getWid(session);
    if (!wid) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

    try {
      await requireModule(wid, 'WORKFORCE');
      await requirePermission(session.user.id, wid, 'workforce.leave.view');
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()));
    const employeeIdParam = searchParams.get('employeeId');

    let employeeId: string | null = employeeIdParam;
    if (employeeId) {
      // Only elevated roles can view arbitrary employees' balances
      const canViewOthers = await checkPermission(session.user.id, wid, 'workforce.leave.manage')
        || await checkPermission(session.user.id, wid, 'workforce.leave.approve');
      if (!canViewOthers) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

      const ok = await prisma.employee.findFirst({ where: { id: employeeId, workspaceId: wid }, select: { id: true } });
      if (!ok) return NextResponse.json({ error: 'Invalid employeeId' }, { status: 400 });
    } else {
      const emp = await getEmployeeByUserId(wid, session.user.id);
      employeeId = emp?.id ?? null;
    }
    if (!employeeId) return NextResponse.json({ balances: [] });

    const balances = await prisma.leaveBalance.findMany({
      where: { workspaceId: wid, employeeId, year },
      include: { leaveType: { select: { id: true, name: true, code: true, color: true, isPaid: true } } },
    });

    return NextResponse.json({ balances });
  } catch (err) {
    console.error('[leave/balances/GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
