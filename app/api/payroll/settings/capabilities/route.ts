import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { getWorkspaceIdForUser } from '@/lib/payroll/settings';
import { checkPermission } from '@/lib/rbac';

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

    const [canView, canManage] = await Promise.all([
      checkPermission(userId, workspaceId, 'payroll.view'),
      checkPermission(userId, workspaceId, 'payroll.settings.manage'),
    ]);

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
