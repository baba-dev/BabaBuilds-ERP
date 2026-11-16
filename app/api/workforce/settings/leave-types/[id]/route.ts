import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { leaveTypePatchSchema } from '@/lib/workforce/settings-schemas';
import { readJson, requireWorkforce, workforceErrorResponse } from '../../../_guard';

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ code: 'NOT_FOUND', error: 'Leave type not found.' }, { status: 404 });

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const g = await requireWorkforce('workforce.settings.manage');
    if ('response' in g) return g.response;
    const { id } = await params;
    const d = leaveTypePatchSchema.parse(await readJson(req));
    const r = await prisma.leaveType.updateMany({ where: { id, workspaceId: g.access.workspaceId }, data: { ...d, ...(d.description !== undefined ? { description: d.description || null } : {}) } });
    if (r.count === 0) return notFound();
    void logActivity({ workspaceId: g.access.workspaceId, action: 'workforce.leave_type_updated', status: 'SUCCESS', actor: { userId: g.access.userId, email: g.access.email }, entity: { type: 'leave_type', id }, metadata: { fields: Object.keys(d) } });
    return NextResponse.json(await prisma.leaveType.findUnique({ where: { id } }));
  } catch (error) {
    return workforceErrorResponse(error, 'leave-types.patch');
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const g = await requireWorkforce('workforce.settings.manage');
    if ('response' in g) return g.response;
    const { id } = await params;
    const wid = g.access.workspaceId;
    if (!(await prisma.leaveType.findFirst({ where: { id, workspaceId: wid }, select: { id: true } }))) return notFound();
    const [requests, balances] = await Promise.all([prisma.leaveRequest.count({ where: { workspaceId: wid, leaveTypeId: id } }), prisma.leaveBalance.count({ where: { workspaceId: wid, leaveTypeId: id } })]);
    if (requests > 0 || balances > 0) return NextResponse.json({ code: 'IN_USE', error: 'This leave type is already in use. Turn it off instead of deleting it.' }, { status: 409 });
    await prisma.leaveType.deleteMany({ where: { id, workspaceId: wid } });
    void logActivity({ workspaceId: wid, action: 'workforce.leave_type_deleted', status: 'SUCCESS', actor: { userId: g.access.userId, email: g.access.email }, entity: { type: 'leave_type', id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return workforceErrorResponse(error, 'leave-types.delete');
  }
}
