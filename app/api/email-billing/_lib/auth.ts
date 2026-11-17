import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getActiveWorkspaceIdForUser } from '@/lib/workspace-scope';
import { checkPermissionsSilent, withPermission } from '@/lib/rbac';
import type { Permission } from '@/lib/permissions';
import { ModuleDisabledError, requireModule } from '@/lib/modules';

/**
 * What a caller is trying to do, independent of the ERP permission keys behind it.
 *  - view:   read domains, mailboxes, plans, subscriptions and the review queue
 *  - billing: change plans, subscriptions, retainer links and review items
 *  - admin:  manage server connections and credentials, run syncs
 */
export type EmailBillingAction = 'view' | 'billing' | 'admin';

const ACTION_PERMISSIONS: Record<EmailBillingAction, { current: Permission; legacy: Permission }> = {
  view: { current: 'email_hosting.view', legacy: 'invoices.view' },
  billing: { current: 'email_hosting.billing', legacy: 'invoices.edit' },
  admin: { current: 'email_hosting.admin_server', legacy: 'workspace.manage_settings' },
};

/**
 * Access is granted by the dedicated `email_hosting.*` permission OR by the invoices (or workspace.manage_settings)
 * permission this module was gated on before, so existing roles keep working. Pass `legacy` to keep a route's
 * previous (more specific) permission, e.g. `invoices.create` for creating retainers.
 */
export async function requireEmailBilling(action: EmailBillingAction, options: { legacy?: Permission } = {}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  const workspaceId = session.workspaceId || (await getActiveWorkspaceIdForUser(userId));
  if (!workspaceId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;

  const { current, legacy: defaultLegacy } = ACTION_PERMISSIONS[action];
  const legacy = options.legacy ?? defaultLegacy;
  const granted = await checkPermissionsSilent(userId, workspaceId, [current, legacy]);
  if (!granted[current] && !granted[legacy]) {
    // Enforce the current key so the denial is audited and the 403 body is the standard RBAC one.
    const perm = await withPermission(userId, workspaceId, current);
    if (!perm.granted) return { response: perm.response } as const;
  }

  try { await requireModule(workspaceId, 'MIAB_BILLING'); } catch (e) {
    if (e instanceof ModuleDisabledError) return { response: NextResponse.json({ error: 'Email Billing module disabled' }, { status: 403 }) } as const;
    throw e;
  }
  return { session, userId, workspaceId } as const;
}
