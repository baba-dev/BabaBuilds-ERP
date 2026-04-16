/**
 * app/api/workforce/leave/requests/[id]/route.ts
 * PATCH — approve / reject a leave request
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

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const wid = await getWid(session.user.id);
    if (!wid) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

    try {
      await requireModule(wid, 'WORKFORCE');
      await requirePermission(session.user.id, wid, 'workforce.leave.approve');
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const body = await req.json() as { action: 'APPROVE' | 'REJECT'; rejectionReason?: string };
    if (!body.action || !['APPROVE', 'REJECT'].includes(body.action)) {
      return NextResponse.json({ error: 'action must be APPROVE or REJECT' }, { status: 400 });
    }

    const existing = await prisma.leaveRequest.findFirst({ where: { id, workspaceId: wid }, include: { employee: { select: { userId: true, firstName: true, lastName: true } }, leaveType: { select: { name: true } } } });
    if (!existing) return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });
    if (existing.status !== 'PENDING') {
      return NextResponse.json({ error: 'Only PENDING requests can be approved or rejected' }, { status: 400 });
    }

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: body.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        rejectionReason: body.action === 'REJECT' ? (body.rejectionReason ?? null) : null,
      },
    });

    // Update leave balance if approved
    if (body.action === 'APPROVE') {
      const year = new Date(existing.startDate).getFullYear();
      await prisma.leaveBalance.updateMany({
        where: { employeeId: existing.employeeId, leaveTypeId: existing.leaveTypeId, year },
        data: { used: { increment: existing.days }, pending: { decrement: existing.days } },
      });
    }

    // Notify the employee (if they have a user account)
    if (existing.employee?.userId) {
      await prisma.inAppNotification.create({
        data: {
          userId: existing.employee.userId,
          eventType: body.action === 'APPROVE' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
          title: body.action === 'APPROVE' ? 'Leave Approved' : 'Leave Rejected',
          body: `Your ${existing.leaveType.name} request has been ${body.action === 'APPROVE' ? 'approved' : 'rejected'}.`,
          actionUrl: '/workforce/leave',
          workspaceId: wid,
        },
      }).catch(() => {});
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[leave/requests/[id]/PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
