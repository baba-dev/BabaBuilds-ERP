import { NextResponse } from 'next/server';
import { checkPermissionsSilent } from '@/lib/rbac';
import type { Permission } from '@/lib/permissions';

/**
 * Collections create, pay and void invoices, so on top of the Email Hosting permission the caller must hold the same invoice
 * permission those actions need anywhere else in the ERP. Returns a 403 response, or null when allowed.
 */
export async function requireInvoicePermissions(auth: { userId: string; workspaceId: string }, needed: Permission[]): Promise<NextResponse | null> {
  const granted = await checkPermissionsSilent(auth.userId, auth.workspaceId, needed);
  const missing = needed.filter((p) => !granted[p]);
  return missing.length ? NextResponse.json({ error: 'You do not have permission for this action.', code: 'RBAC_PERMISSION_DENIED', permission: missing[0] }, { status: 403 }) : null;
}
