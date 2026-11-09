/**
 * app/api/workforce/attendance/route.ts
 * GET  — attendance records for a date range
 * POST — create/upsert an attendance record
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requirePermission, checkPermissionSilent, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
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
      await requirePermission(session.user.id, wid, 'workforce.attendance.view');
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const employeeId = searchParams.get('employeeId');

    // STAFF can only view their own
    const canManage = await checkPermissionSilent(session.user.id, wid, 'workforce.attendance.manage');
    let scopedEmployeeId = employeeId;
    if (!canManage) {
      const emp = await getEmployeeByUserId(wid, session.user.id);
      scopedEmployeeId = emp?.id ?? '__none__';
    }

    const fromDate = from ? new Date(from) : null;
    if (fromDate) fromDate.setHours(0, 0, 0, 0);
    const toDateExclusive = to ? new Date(to) : null;
    if (toDateExclusive) {
      toDateExclusive.setHours(0, 0, 0, 0);
      toDateExclusive.setDate(toDateExclusive.getDate() + 1);
    }

    const records = await prisma.attendanceRecord.findMany({
      where: {
        workspaceId: wid,
        ...(scopedEmployeeId ? { employeeId: scopedEmployeeId } : {}),
        ...(fromDate ? { date: { gte: fromDate } } : {}),
        ...(toDateExclusive ? { date: { lt: toDateExclusive } } : {}),
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: [{ date: 'desc' }, { employee: { firstName: 'asc' } }],
      take: 500,
    });

    return NextResponse.json({ records });
  } catch (err) {
    console.error('[attendance/GET]', err);
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
      // Require baseline attendance access for all writes (self-service included)
      await requirePermission(session.user.id, wid, 'workforce.attendance.view');
    }
    catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const body = await req.json() as { employeeId?: string; date?: string; status?: string; checkInAt?: string; checkOutAt?: string; notes?: string };
    const canManage = await checkPermissionSilent(session.user.id, wid, 'workforce.attendance.manage');

    let targetEmployeeId = body.employeeId;

    // If STAFF: can only self-check-in
    if (!canManage) {
      const emp = await getEmployeeByUserId(wid, session.user.id);
      if (!emp) return NextResponse.json({ error: 'No employee profile linked to your account' }, { status: 403 });
      targetEmployeeId = emp.id;
    }

    if (!targetEmployeeId || !body.date || !body.status) {
      return NextResponse.json({ error: 'employeeId, date, status are required' }, { status: 400 });
    }

    const dateObj = new Date(body.date);
    dateObj.setHours(0, 0, 0, 0);

    // Validate that employee belongs to this workspace (prevents cross-workspace writes)
    const employee = await prisma.employee.findFirst({
      where: { id: targetEmployeeId, workspaceId: wid },
      select: { id: true },
    });
    if (!employee) return NextResponse.json({ error: 'Invalid employeeId' }, { status: 400 });

    const record = await prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: targetEmployeeId, date: dateObj } },
      create: {
        workspaceId: wid,
        employeeId: targetEmployeeId,
        date: dateObj,
        status: body.status as 'PRESENT' | 'LATE' | 'ABSENT' | 'HALF_DAY' | 'HOLIDAY' | 'REMOTE',
        checkInAt: body.checkInAt ? new Date(body.checkInAt) : undefined,
        checkOutAt: body.checkOutAt ? new Date(body.checkOutAt) : undefined,
        notes: body.notes,
        isManagerEntered: canManage,
        managedByUserId: canManage ? session.user.id : undefined,
      },
      update: {
        status: body.status as 'PRESENT' | 'LATE' | 'ABSENT' | 'HALF_DAY' | 'HOLIDAY' | 'REMOTE',
        checkInAt: body.checkInAt ? new Date(body.checkInAt) : undefined,
        checkOutAt: body.checkOutAt ? new Date(body.checkOutAt) : undefined,
        notes: body.notes,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    console.error('[attendance/POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
