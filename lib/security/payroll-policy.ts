import 'server-only';

import type { BusinessRole, Permission } from '@/lib/permissions';
import { requirePermission } from '@/lib/rbac';
import { logSensitivePayrollActivity } from '@/lib/security/activity-log';

export type PayrollAction = 'view' | 'prepare' | 'approve' | 'post' | 'settings.manage';

const PAYROLL_PERMISSION_BY_ACTION: Record<PayrollAction, Permission> = {
  view: 'payroll.view',
  prepare: 'payroll.prepare',
  approve: 'payroll.approve',
  post: 'payroll.post',
  'settings.manage': 'payroll.settings.manage',
};

export class PayrollPolicyError extends Error {
  readonly code: 'PAYROLL_SELF_APPROVAL_FORBIDDEN';

  constructor(message = 'Preparer cannot self-approve payroll for non-owner roles.') {
    super(message);
    this.name = 'PayrollPolicyError';
    this.code = 'PAYROLL_SELF_APPROVAL_FORBIDDEN';
  }
}

export async function requirePayrollPermission(
  userId: string,
  workspaceId: string,
  action: PayrollAction,
): Promise<{ role: BusinessRole; permission: Permission }> {
  const permission = PAYROLL_PERMISSION_BY_ACTION[action];
  const { role } = await requirePermission(userId, workspaceId, permission);
  return { role, permission };
}

export function enforcePayrollTwoPersonControl(input: {
  actorUserId: string;
  actorRole: BusinessRole;
  preparedByUserId?: string | null;
}) {
  const { actorUserId, actorRole, preparedByUserId } = input;

  if (!preparedByUserId) return;
  if (actorRole === 'OWNER') return;

  if (preparedByUserId === actorUserId) {
    throw new PayrollPolicyError();
  }
}

export async function requirePayrollApprovalPolicy(input: {
  actorUserId: string;
  workspaceId: string;
  preparedByUserId?: string | null;
  actorEmail?: string | null;
  entityId?: string | null;
  request?: Request;
}) {
  const { role } = await requirePayrollPermission(input.actorUserId, input.workspaceId, 'approve');

  enforcePayrollTwoPersonControl({
    actorUserId: input.actorUserId,
    actorRole: role,
    preparedByUserId: input.preparedByUserId,
  });

  await logSensitivePayrollActivity({
    action: 'payroll.approve',
    status: 'SUCCESS',
    workspaceId: input.workspaceId,
    actor: {
      userId: input.actorUserId,
      email: input.actorEmail ?? null,
    },
    entity: {
      type: 'payroll_run',
      id: input.entityId ?? null,
    },
    metadata: {
      preparedByUserId: input.preparedByUserId ?? null,
      approverRole: role,
      control: 'two_person_control',
    },
    request: input.request,
  });

  return { role };
}
