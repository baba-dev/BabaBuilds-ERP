import { NextResponse } from 'next/server';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { logActivity } from '@/lib/security/activity-log';
import { cancelLeave, decideLeave } from '@/lib/workforce/leave-service';
import { leaveDecisionSchema } from '@/lib/workforce/schemas';
import { can, readJson, requireWorkforce, workforceErrorResponse } from '../../../_guard';

type Ctx = { params: Promise<{ id: string }> };

/** Approve or reject a pending request. Balances move in the same transaction; nobody can decide their own request. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const gate = await requireWorkforce('workforce.leave.approve');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const { id } = await ctx.params;
    const d = leaveDecisionSchema.parse(await readJson(req));
    const { request, status } = await decideLeave({ workspaceId, requestId: id, approverUserId: userId, action: d.action, rejectionReason: d.rejectionReason });
    if (request.employee.userId) {
      void dispatchNotification({ event: status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED', workspaceId, occurrenceKey: 'leave_' + id + '_' + status.toLowerCase(), userIds: [request.employee.userId], data: { leaveType: request.leaveType.name, employeeName: `${request.employee.firstName} ${request.employee.lastName}` } }).catch(() => undefined);
    }
    void logActivity({ workspaceId, action: `workforce.leave_${status.toLowerCase()}`, status: 'SUCCESS', actor: { userId, email }, entity: { type: 'leave_request', id }, metadata: { days: request.days } });
    return NextResponse.json({ success: true, status });
  } catch (e) {
    return workforceErrorResponse(e, 'leave.decide');
  }
}

/** Cancel a request: the owner's own, or anyone's for a manager. Reserved or used days go back to the balance. */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const gate = await requireWorkforce('workforce.leave.view');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const { id } = await ctx.params;
    const isManager = (await can(gate.access, 'workforce.leave.manage')) || (await can(gate.access, 'workforce.leave.approve'));
    const r = await cancelLeave({ workspaceId, requestId: id, byUserId: userId, isManager });
    void logActivity({ workspaceId, action: 'workforce.leave_cancelled', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'leave_request', id }, metadata: { wasApproved: r.wasApproved } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return workforceErrorResponse(e, 'leave.cancel');
  }
}
