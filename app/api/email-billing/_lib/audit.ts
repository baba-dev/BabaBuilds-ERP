import 'server-only';
import { logActivity } from '@/lib/security/activity-log';

type AuditAuth = { workspaceId: string; userId: string };

/**
 * One audit entry per Email Billing mutation. Metadata must never contain tokens, passwords or raw server responses.
 * Failures to write the audit entry never fail the request (same contract as the other modules).
 */
export function auditEmailBilling(
  auth: AuditAuth,
  action: string,
  entity: { type: string; id: string },
  metadata?: Record<string, unknown>,
  request?: Request,
) {
  void logActivity({
    workspaceId: auth.workspaceId,
    action: `email_billing.${action}`,
    status: 'SUCCESS',
    actor: { userId: auth.userId, email: null },
    entity,
    metadata,
    request,
  });
}
