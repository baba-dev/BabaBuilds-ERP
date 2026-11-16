import 'server-only';

import { prisma } from '@/lib/prisma';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { logActivity } from '@/lib/security/activity-log';
import { requirePayrollApprovalPolicy } from '@/lib/security/payroll-policy';
import { nextStatusForTransition, type PayrollRunTransitionAction } from '@/lib/payroll/run-transitions';
import type { PayrollIssue } from './checks';

export class LifecycleError extends Error {
  constructor(readonly code: 'INVALID_TRANSITION' | 'HAS_ERRORS' | 'NOT_FOUND', message: string) {
    super(message);
  }
}

/** Moves a run through draft, review and approved, with the two-person rule applied on approval. */
export async function transitionRun(args: {
  workspaceId: string;
  runId: string;
  userId: string;
  email?: string | null;
  action: PayrollRunTransitionAction;
  note?: string | null;
  request?: Request;
}) {
  const { workspaceId, runId, userId, action } = args;
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, workspaceId }, include: { period: { select: { startDate: true } } } });
  if (!run) throw new LifecycleError('NOT_FOUND', 'Payroll run not found.');

  let next;
  try {
    next = nextStatusForTransition(run.status, action);
  } catch {
    throw new LifecycleError('INVALID_TRANSITION', `A run that is ${run.status.toLowerCase()} cannot be moved that way.`);
  }

  if (action === 'submit_review') {
    const issues = ((run.preflightJson ?? {}) as { issues?: PayrollIssue[] }).issues ?? [];
    const blocking = issues.filter((i) => i.severity === 'error' && i.code !== 'NO_COMPENSATION');
    if (blocking.length > 0) throw new LifecycleError('HAS_ERRORS', `Fix ${blocking.length} blocking issue${blocking.length === 1 ? '' : 's'} before submitting.`);
  }
  if (action === 'approve') {
    await requirePayrollApprovalPolicy({ actorUserId: userId, workspaceId, preparedByUserId: run.generatedByUserId, actorEmail: args.email, entityId: runId, request: args.request });
  }

  const now = new Date();
  const data =
    action === 'submit_review' ? { status: next, submittedAt: now }
    : action === 'approve' ? { status: next, approvedAt: now, approvedByUserId: userId }
    : { status: next, approvedAt: null, approvedByUserId: null, ...(action === 'return_draft' ? { submittedAt: null } : {}) };

  // Compare-and-set on the current status so two people cannot move the same run at once.
  const moved = await prisma.payrollRun.updateMany({ where: { id: runId, workspaceId, status: run.status }, data });
  if (moved.count === 0) throw new LifecycleError('INVALID_TRANSITION', 'Someone else just changed this run. Reload and try again.');

  void logActivity({
    workspaceId, action: `payroll.${action}`, status: 'SUCCESS', actor: { userId, email: args.email ?? null },
    entity: { type: 'payroll_run', id: runId }, metadata: { from: run.status, to: next, note: args.note ?? null },
  });

  if (action === 'submit_review') {
    const month = run.period.startDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    void dispatchNotification({
      event: 'DEADLINE_ALERT', workspaceId,
      data: { title: `Payroll for ${month} is waiting for your approval`, deadline: 'today', description: `Net pay ${Number(run.totalNetPay).toLocaleString('en-IN')} for review.`, actionUrl: `/payroll/runs/${runId}` },
    }).catch(() => undefined);
  }
  return { status: next };
}
