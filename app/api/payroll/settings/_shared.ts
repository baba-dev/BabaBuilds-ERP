import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { getWorkspaceIdForUser } from '@/lib/payroll/settings';
import { RbacDeniedError, rbacDeniedResponse, requirePermission } from '@/lib/rbac';
import type { Permission } from '@/lib/permissions';

export type PayrollSettingsPermission = Extract<Permission, 'payroll.view' | 'payroll.settings.manage'>;

type Access = {
  userId: string;
  workspaceId: string;
};

export async function requirePayrollSettingsAccess(
  permission: PayrollSettingsPermission,
): Promise<{ access?: Access; response?: NextResponse }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const workspaceId = await getWorkspaceIdForUser(session.user.id);
  if (!workspaceId) {
    return { response: NextResponse.json({ error: 'No workspace' }, { status: 400 }) };
  }

  try {
    await requirePermission(session.user.id, workspaceId, permission);
  } catch (error) {
    if (error instanceof RbacDeniedError) {
      return { response: rbacDeniedResponse(error) };
    }
    throw error;
  }

  return {
    access: {
      userId: session.user.id,
      workspaceId,
    },
  };
}
