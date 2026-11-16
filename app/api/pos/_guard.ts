import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { isModuleEnabled } from '@/lib/modules';
import { RbacDeniedError, rbacDeniedResponse, requirePermission } from '@/lib/rbac';
import { resolveSessionMembership } from '@/lib/workspace-scope';

export type PosAccess = { userId: string; workspaceId: string; email: string | null };

/** Resolves the signed-in member's workspace, checks the POS module is on, and checks pos.view or pos.checkout. */
export async function requirePos(level: 'view' | 'checkout' | 'refund'): Promise<{ access: PosAccess } | { response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const workspaceId = (await resolveSessionMembership(session))?.workspaceId;
  if (!userId || !workspaceId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await isModuleEnabled(workspaceId, 'POS'))) return { response: NextResponse.json({ error: 'POS module is disabled', code: 'MODULE_DISABLED' }, { status: 403 }) };
  try {
    await requirePermission(userId, workspaceId, level === 'refund' ? 'pos.refund' : level === 'checkout' ? 'pos.checkout' : 'pos.view');
  } catch (e) {
    if (e instanceof RbacDeniedError) return { response: rbacDeniedResponse(e) as NextResponse };
    throw e;
  }
  return { access: { userId, workspaceId, email: (session?.user as { email?: string | null } | undefined)?.email ?? null } };
}

export function posErrorResponse(error: unknown, scope: string): NextResponse {
  if (error instanceof RbacDeniedError) return rbacDeniedResponse(error) as NextResponse;
  if (error instanceof z.ZodError) return NextResponse.json({ code: 'INVALID_INPUT', error: 'Check the sale details.', fields: error.flatten().fieldErrors }, { status: 422 });
  console.error(`[pos/${scope}]`, error);
  return NextResponse.json({ code: 'INTERNAL_ERROR', error: 'The register hit a problem. Please try again.' }, { status: 500 });
}

export const readJson = (req: Request): Promise<unknown> => req.json().catch(() => null);
