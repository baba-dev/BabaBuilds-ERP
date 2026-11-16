import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { isModuleEnabled } from '@/lib/modules';
import { RbacDeniedError, rbacDeniedResponse, requirePermission } from '@/lib/rbac';
import { resolveSessionMembership } from '@/lib/workspace-scope';

export type ShopAccess = { userId: string; workspaceId: string; email: string | null };

/** Resolves the member's workspace, checks the Shop module is on, and checks one shop permission. */
export async function requireShop(permission: 'shop.view' | 'shop.orders.view' | 'shop.orders.manage' | 'shop.content.manage' | 'shop.settings.manage'): Promise<{ access: ShopAccess } | { response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const workspaceId = (await resolveSessionMembership(session))?.workspaceId;
  if (!userId || !workspaceId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await isModuleEnabled(workspaceId, 'SHOP'))) return { response: NextResponse.json({ error: 'Shop module is disabled for this workspace.', code: 'SHOP_MODULE_DISABLED' }, { status: 409 }) };
  try {
    await requirePermission(userId, workspaceId, permission);
  } catch (e) {
    if (e instanceof RbacDeniedError) return { response: rbacDeniedResponse(e) as NextResponse };
    throw e;
  }
  return { access: { userId, workspaceId, email: (session?.user as { email?: string | null } | undefined)?.email ?? null } };
}

export function shopErrorResponse(error: unknown, scope: string): NextResponse {
  if (error instanceof RbacDeniedError) return rbacDeniedResponse(error) as NextResponse;
  if (error instanceof z.ZodError) return NextResponse.json({ code: 'INVALID_INPUT', error: error.issues[0]?.message ?? 'Check the details.', fields: error.flatten().fieldErrors }, { status: 422 });
  console.error(`[shop/${scope}]`, error);
  return NextResponse.json({ code: 'INTERNAL_ERROR', error: 'The shop request failed unexpectedly.' }, { status: 500 });
}

export const readJson = (req: Request): Promise<unknown> => req.json().catch(() => null);
