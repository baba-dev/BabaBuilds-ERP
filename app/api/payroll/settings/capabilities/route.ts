import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { getWorkspaceIdForUser } from '@/lib/payroll/settings';
import { isModuleEnabled } from '@/lib/modules';
import { checkPermissionsSilent } from '@/lib/rbac';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const typedSession = session as { workspaceId?: string } | null;
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = typedSession?.workspaceId ?? (await getWorkspaceIdForUser(userId));
    if (!workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // With the module off nobody can view or manage payroll, whatever their role.
    if (!(await isModuleEnabled(workspaceId, 'PAYROLL'))) {
      return NextResponse.json({ canView: false, canManage: false, readOnly: false, moduleEnabled: false });
    }

    const grants = await checkPermissionsSilent(userId, workspaceId, [
      'payroll.view',
      'payroll.settings.manage',
    ]);
    const canView = grants['payroll.view'];
    const canManage = grants['payroll.settings.manage'];

    return NextResponse.json({
      canView,
      canManage,
      readOnly: canView && !canManage,
    });
  } catch (e) {
    console.error('[payroll/settings/capabilities]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
