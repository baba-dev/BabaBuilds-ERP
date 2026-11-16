import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { InventoryError } from '@/lib/inventory/service';
import { RbacDeniedError, rbacDeniedResponse, requirePermission } from '@/lib/rbac';
import { resolveSessionMembership } from '@/lib/workspace-scope';

export type InventoryAccess = { userId: string; workspaceId: string; email: string | null };

/** Resolves the signed-in member's workspace and checks inventory.view / inventory.edit. */
export async function requireInventory(level: 'view' | 'edit'): Promise<{ access: InventoryAccess } | { response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const workspaceId = (await resolveSessionMembership(session))?.workspaceId;
  if (!userId || !workspaceId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  try {
    await requirePermission(userId, workspaceId, level === 'edit' ? 'inventory.edit' : 'inventory.view');
  } catch (e) {
    if (e instanceof RbacDeniedError) return { response: rbacDeniedResponse(e) as NextResponse };
    throw e;
  }
  return { access: { userId, workspaceId, email: (session?.user as { email?: string | null } | undefined)?.email ?? null } };
}

const STATUS: Record<InventoryError['code'], number> = {
  NOT_FOUND: 404, INSUFFICIENT_STOCK: 409, CONFLICT: 409, INVALID_STATE: 409, OVER_RECEIPT: 422, DUPLICATE_SKU: 409, GSTIN_INVALID: 422, VALIDATION: 422,
};

export function inventoryErrorResponse(error: unknown, scope: string): NextResponse {
  if (error instanceof RbacDeniedError) return rbacDeniedResponse(error) as NextResponse;
  if (error instanceof z.ZodError) {
    return NextResponse.json({ code: 'INVALID_INPUT', error: 'Check the highlighted fields.', fields: error.flatten().fieldErrors }, { status: 422 });
  }
  if (error instanceof InventoryError) return NextResponse.json({ code: error.code, error: error.message, ...error.meta }, { status: STATUS[error.code] });
  if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002') {
    return NextResponse.json({ code: 'DUPLICATE_SKU', error: 'A product with this SKU already exists.' }, { status: 409 });
  }
  console.error(`[inventory/${scope}]`, error);
  return NextResponse.json({ code: 'INTERNAL_ERROR', error: 'Inventory request failed unexpectedly.' }, { status: 500 });
}

export const readJson = (req: Request): Promise<unknown> => req.json().catch(() => null);
