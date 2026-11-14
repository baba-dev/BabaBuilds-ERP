import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { isModuleEnabled } from '@/lib/modules';
import { resolveSessionMembership } from '@/lib/workspace-scope';
import { RbacDeniedError, rbacDeniedResponse, checkPermissionsSilent } from '@/lib/rbac';
import type { PayrollAction } from '@/lib/security/payroll-policy';
import { requirePayrollPermission } from '@/lib/security/payroll-policy';

export type PayrollApiAccess = {
  userId: string;
  workspaceId: string;
  email: string | null;
};

/**
 * Resolves session workspace, enforces PAYROLL module, and payroll RBAC action.
 */
export async function requirePayrollModuleAndAction(
  action: PayrollAction,
): Promise<{ access: PayrollApiAccess } | { response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const workspaceId = (await resolveSessionMembership(session))?.workspaceId;
  if (!workspaceId) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const payrollEnabled = await isModuleEnabled(workspaceId, 'PAYROLL');
  if (!payrollEnabled) {
    return {
      response: NextResponse.json(
        { error: 'Payroll module is not enabled for this workspace.', code: 'MODULE_DISABLED' },
        { status: 403 },
      ),
    };
  }

  try {
    await requirePayrollPermission(userId, workspaceId, action);
  } catch (err) {
    if (err instanceof RbacDeniedError) return { response: rbacDeniedResponse(err) };
    throw err;
  }

  const email = (session?.user as { email?: string | null } | undefined)?.email ?? null;

  return {
    access: {
      userId,
      workspaceId,
      email,
    },
  };
}

export async function getPayrollRunActionCapabilities(
  userId: string,
  workspaceId: string,
  status: string,
  isPostedFinancially: boolean,
): Promise<{
  canSubmitReview: boolean;
  canApprove: boolean;
  canReturnDraft: boolean;
  canReturnReview: boolean;
  canPost: boolean;
}> {
  const grants = await checkPermissionsSilent(userId, workspaceId, [
    'payroll.prepare',
    'payroll.approve',
    'payroll.post',
  ]);
  const prep = grants['payroll.prepare'];
  const appr = grants['payroll.approve'];
  const post = grants['payroll.post'];

  const blocked = isPostedFinancially || status === 'POSTED';

  return {
    canSubmitReview: prep && !blocked && status === 'DRAFT',
    canApprove: appr && !blocked && status === 'REVIEW',
    canReturnDraft: prep && !blocked && status === 'REVIEW',
    canReturnReview: prep && !blocked && status === 'APPROVED',
    canPost: post && !blocked && status === 'APPROVED',
  };
}
