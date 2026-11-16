import 'server-only';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ModuleDisabledError, requireModule } from '@/lib/modules';
import { withPermission } from '@/lib/rbac';
import { getActiveWorkspaceIdForUser } from '@/lib/workspace-scope';
import type { Permission } from '@/lib/permissions';

export type ArCtx = { workspaceId: string; userId: string; email: string | null };
export const arError = (status: number, code: string, message: string, extra?: Record<string, unknown>) => NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status });

/** Session, the AR Collections module being on, and a fresh permission check: invoices.view to read, invoices.edit to change follow-ups, invoices.send to email customers. */
export async function requireArAccess(permission: Extract<Permission, 'invoices.view' | 'invoices.edit' | 'invoices.send' | 'invoices.export'>): Promise<{ ok: true; ctx: ArCtx } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return { ok: false, response: arError(401, 'AUTH_UNAUTHORIZED', 'Unauthorized') };
  const workspaceId = await getActiveWorkspaceIdForUser(userId);
  if (!workspaceId) return { ok: false, response: arError(401, 'AUTH_UNAUTHORIZED', 'Unauthorized') };
  const perm = await withPermission(userId, workspaceId, permission);
  if (!perm.granted) return { ok: false, response: perm.response };
  try {
    await requireModule(workspaceId, 'AR_COLLECTIONS');
  } catch (error) {
    if (error instanceof ModuleDisabledError) return { ok: false, response: arError(403, 'MODULE_DISABLED', 'Module disabled') };
    throw error;
  }
  return { ok: true, ctx: { workspaceId, userId, email: session?.user?.email ?? null } };
}
