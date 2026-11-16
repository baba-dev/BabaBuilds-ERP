import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { LeaveError } from '@/lib/workforce/leave-service';
import { ModuleDisabledError, requireModule } from '@/lib/modules';
import { checkPermissionSilent, RbacDeniedError, rbacDeniedResponse, requirePermission } from '@/lib/rbac';
import { resolveSessionMembership } from '@/lib/workspace-scope';

export type WorkforceAccess = { userId: string; workspaceId: string; email: string | null };

/** Resolves the member's workspace, checks the Workforce module is on, and checks one workforce permission. */
export async function requireWorkforce(permission: string): Promise<{ access: WorkforceAccess } | { response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const workspaceId = (await resolveSessionMembership(session))?.workspaceId;
  if (!userId || !workspaceId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  try {
    await requireModule(workspaceId, 'WORKFORCE');
    await requirePermission(userId, workspaceId, permission as Parameters<typeof requirePermission>[2]);
  } catch (e) {
    if (e instanceof ModuleDisabledError) return { response: NextResponse.json({ error: 'The Workforce module is turned off.', code: 'MODULE_DISABLED' }, { status: 403 }) };
    if (e instanceof RbacDeniedError) return { response: rbacDeniedResponse(e) as NextResponse };
    throw e;
  }
  return { access: { userId, workspaceId, email: (session?.user as { email?: string | null } | undefined)?.email ?? null } };
}

export const can = (a: WorkforceAccess, permission: string) => checkPermissionSilent(a.userId, a.workspaceId, permission as Parameters<typeof checkPermissionSilent>[2]);

export function workforceErrorResponse(error: unknown, scope: string): NextResponse {
  if (error instanceof RbacDeniedError) return rbacDeniedResponse(error) as NextResponse;
  if (error instanceof z.ZodError) return NextResponse.json({ code: 'INVALID_INPUT', error: error.issues[0]?.message ?? 'Check the details.', fields: error.flatten().fieldErrors }, { status: 422 });
  if (error instanceof LeaveError) return NextResponse.json({ code: error.code, error: error.message, ...error.meta }, { status: error.status });
  if (error && typeof error === 'object' && (error as { code?: string }).code === 'P2002') return NextResponse.json({ code: 'DUPLICATE', error: 'That record already exists.' }, { status: 409 });
  console.error(`[workforce/${scope}]`, error);
  return NextResponse.json({ code: 'INTERNAL_ERROR', error: 'The request failed unexpectedly.' }, { status: 500 });
}

export const readJson = (req: Request): Promise<unknown> => req.json().catch(() => null);
