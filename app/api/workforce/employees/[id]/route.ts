/**
 * app/api/workforce/employees/[id]/route.ts
 * GET   — employee detail
 * PATCH — update employee
 * DELETE — soft-deactivate employee
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { requireModule, ModuleDisabledError } from '@/lib/modules';

async function getWid(userId: string) {
  const wu = await prisma.workspaceUser.findFirst({ where: { userId, isActive: true }, select: { workspaceId: true } });
  return wu?.workspaceId ?? null;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const wid = await getWid(session.user.id);
    if (!wid) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

    try {
      await requireModule(wid, 'WORKFORCE');
      await requirePermission(session.user.id, wid, 'workforce.people.view');
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const employee = await prisma.employee.findFirst({
      where: { id, workspaceId: wid },
      include: {
        department: true,
        designation: true,
        manager: { select: { id: true, firstName: true, lastName: true, designation: { select: { title: true } } } },
        directReports: { select: { id: true, firstName: true, lastName: true, designation: { select: { title: true } } } },
        attendanceRecords: { orderBy: { date: 'desc' }, take: 30 },
        leaveRequests: { orderBy: { createdAt: 'desc' }, take: 10, include: { leaveType: true } },
        leaveBalances: { where: { year: new Date().getFullYear() }, include: { leaveType: true } },
      },
    });

    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    return NextResponse.json(employee);
  } catch (err) {
    console.error('[employee/GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const wid = await getWid(session.user.id);
    if (!wid) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

    try {
      await requireModule(wid, 'WORKFORCE');
      await requirePermission(session.user.id, wid, 'workforce.people.manage');
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const body = await req.json() as Record<string, unknown>;
    const allowedFields = ['firstName', 'lastName', 'email', 'phone', 'departmentId', 'designationId', 'managerId', 'location', 'status', 'joinDate', 'exitDate', 'notes', 'emergencyName', 'emergencyPhone', 'emergencyRelation'];
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        if (field === 'joinDate' || field === 'exitDate') {
          data[field] = body[field] ? new Date(String(body[field])) : null;
        } else {
          data[field] = body[field] ?? null;
        }
      }
    }

    const employee = await prisma.employee.update({
      where: { id, workspaceId: wid },
      data: data as Parameters<typeof prisma.employee.update>[0]['data'],
      include: { department: true, designation: true },
    });

    return NextResponse.json(employee);
  } catch (err) {
    console.error('[employee/PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const wid = await getWid(session.user.id);
    if (!wid) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

    try {
      await requireModule(wid, 'WORKFORCE');
      await requirePermission(session.user.id, wid, 'workforce.people.manage');
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    // Soft deactivate, never hard delete
    await prisma.employee.update({
      where: { id, workspaceId: wid },
      data: { status: 'INACTIVE', exitDate: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[employee/DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
