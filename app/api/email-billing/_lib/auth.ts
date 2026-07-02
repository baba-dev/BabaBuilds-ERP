import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getActiveWorkspaceIdForUser } from '@/lib/workspace-scope';
import { withPermission } from '@/lib/rbac';
import type { Permission } from '@/lib/permissions';
import { ModuleDisabledError, requireModule } from '@/lib/modules';

export async function requireEmailBilling(permission: Permission) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  const workspaceId = session.workspaceId || (await getActiveWorkspaceIdForUser(userId));
  if (!workspaceId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  const perm = await withPermission(userId, workspaceId, permission);
  if (!perm.granted) return { response: perm.response } as const;
  try { await requireModule(workspaceId, 'MIAB_BILLING'); } catch (e) {
    if (e instanceof ModuleDisabledError) return { response: NextResponse.json({ error: 'Email Billing module disabled' }, { status: 403 }) } as const;
    throw e;
  }
  return { session, userId, workspaceId } as const;
}
