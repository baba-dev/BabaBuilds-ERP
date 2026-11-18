/**
 * Phase 5 C+D: explicit nonfinancial email/push canary routing.
 * Independent channel switches, exactly one workspace, OFF by default.
 * No undefined, wildcard or CSV workspace selector can activate delivery.
 */
export const QUEUED_NOTIFICATION_EVENTS = [
  'CLIENT_ADDED', 'SERVICE_CREATED', 'PROPOSAL_VIEWED', 'SETTINGS_UPDATED',
  'LEAVE_REQUEST_SUBMITTED', 'LEAVE_APPROVED', 'LEAVE_REJECTED',
] as const;

type Env = Record<string, string | undefined>;
export type NotificationRoute = { email: boolean; push: boolean };

export function notificationRoute(
  workspaceId: string,
  event: string,
  occurrenceKey: string | undefined,
  env: Env = process.env,
): NotificationRoute {
  const off = { email: false, push: false };
  if (!QUEUED_NOTIFICATION_EVENTS.some((safe) => safe === event)) return off;
  if (!occurrenceKey || !/^[A-Za-z0-9:_-]{8,120}$/.test(occurrenceKey)) return off;
  const allowed = env.ERP_REDIS_NOTIFICATION_WORKSPACE_IDS?.trim() ?? '';
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(allowed) || workspaceId !== allowed) return off;
  if (env.ERP_REDIS_ENABLED !== 'true' || env.ERP_REDIS_JOBS_ENABLED !== 'true') return off;
  return {
    email: env.ERP_REDIS_NOTIFICATION_EMAIL_ENABLED === 'true',
    push: env.ERP_REDIS_NOTIFICATION_PUSH_ENABLED === 'true',
  };
}

export function notificationSourceOccurrence(event: string, occurrenceKey: string): string {
  const key = 'notification_' + event.toLowerCase() + '_' + occurrenceKey;
  if (!/^[a-z0-9:_-]{8,180}$/.test(key)) throw new Error('INVALID_NOTIFICATION_OCCURRENCE');
  return key;
}
