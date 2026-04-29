import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { getWorkspaceIdForUser } from '@/lib/payroll/settings';
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
