/**
 * app/api/workforce/employees/route.ts
 * GET  — list employees (with pagination + filtering)
 * POST — create a new employee
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { requireModule, ModuleDisabledError } from '@/lib/modules';
import { generateEmployeeCode } from '@/lib/workforce/index';
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
      await requirePermission(session.user.id, wid, 'workforce.people.view');
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Workforce module is disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') ?? '';
    const department = searchParams.get('department') ?? '';
    const status = searchParams.get('status') ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '25'));

    const where = {
      workspaceId: wid,
      ...(search ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { employeeCode: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
      ...(department ? { departmentId: department } : {}),
      ...(status ? { status: status as 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE' } : {}),
    };

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: {
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, title: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ firstName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.employee.count({ where }),
    ]);

    return NextResponse.json({ employees, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[employees/GET]', err);
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
      await requirePermission(session.user.id, wid, 'workforce.people.manage');
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Workforce module is disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const body = await req.json() as Record<string, unknown>;
    const { firstName, lastName, email, phone, departmentId, designationId, managerId, joinDate, location, userId: linkedUserId, notes } = body;

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'firstName and lastName are required' }, { status: 400 });
    }

    const deptId = departmentId ? String(departmentId) : null;
    const desigId = designationId ? String(designationId) : null;
    const mgrId = managerId ? String(managerId) : null;
    const linkUid = linkedUserId ? String(linkedUserId) : null;

    // Validate workspace-scoped foreign keys (prevent cross-workspace links)
    if (deptId) {
      const ok = await prisma.department.findFirst({ where: { id: deptId, workspaceId: wid }, select: { id: true } });
      if (!ok) return NextResponse.json({ error: 'Invalid departmentId' }, { status: 400 });
    }
    if (desigId) {
      const ok = await prisma.designation.findFirst({ where: { id: desigId, workspaceId: wid }, select: { id: true } });
      if (!ok) return NextResponse.json({ error: 'Invalid designationId' }, { status: 400 });
    }
    if (mgrId) {
      const ok = await prisma.employee.findFirst({ where: { id: mgrId, workspaceId: wid }, select: { id: true } });
      if (!ok) return NextResponse.json({ error: 'Invalid managerId' }, { status: 400 });
    }
    if (linkUid) {
      const ok = await prisma.workspaceUser.findFirst({ where: { userId: linkUid, workspaceId: wid, isActive: true }, select: { id: true } });
      if (!ok) return NextResponse.json({ error: 'Invalid userId for this workspace' }, { status: 400 });
    }

    const employeeCode = await generateEmployeeCode(wid);
    const employee = await prisma.employee.create({
      data: {
        workspaceId: wid,
        firstName: String(firstName),
        lastName: String(lastName),
        email: email ? String(email) : undefined,
        phone: phone ? String(phone) : undefined,
        departmentId: deptId ?? undefined,
        designationId: desigId ?? undefined,
        managerId: mgrId ?? undefined,
        joinDate: joinDate ? new Date(String(joinDate)) : undefined,
        location: location ? String(location) : undefined,
        userId: linkUid ?? undefined,
        notes: notes ? String(notes) : undefined,
        employeeCode,
      },
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (err) {
    console.error('[employees/POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
