/**
 * Phase 5 E: scheduled report transport is independently gated and
 * Supports previously approved single-workspace scope and separately
 * authorized sitewide scope, both OFF until explicitly configured.
 */
type Env = Record<string, string | undefined>;
const WORKSPACE_ID = /^[A-Za-z0-9_-]{8,80}$/;
const REPORT_VIEW_ID = /^[A-Za-z0-9_-]{8,80}$/;

export function reportQueueWorkspace(env: Env = process.env): string | null {
  const ws = env.ERP_REDIS_REPORT_WORKSPACE_ID?.trim() ?? '';
  if (!WORKSPACE_ID.test(ws) ||
      env.ERP_REDIS_ENABLED !== 'true' ||
      env.ERP_REDIS_JOBS_ENABLED !== 'true' ||
      env.ERP_REDIS_REPORT_EMAIL_ENABLED !== 'true' ||
      env.ERP_STAGING_MODE === '1') return null;
  return ws;
}

export function reportQueueEnabled(workspaceId: string, env: Env = process.env): boolean {
  if (!WORKSPACE_ID.test(workspaceId) ||
      env.ERP_REDIS_ENABLED !== 'true' ||
      env.ERP_REDIS_JOBS_ENABLED !== 'true' ||
      env.ERP_REDIS_REPORT_EMAIL_ENABLED !== 'true' ||
      env.ERP_STAGING_MODE === '1') return false;
  if (env.ERP_REDIS_EXTERNAL_DELIVERY_SCOPE === 'sitewide' &&
      env.ERP_REDIS_SITEWIDE_DELIVERY_APPROVED === 'true') return true;
  return reportQueueWorkspace(env) === workspaceId;
}

export function reportOccurrenceKey(reportViewId: string, scheduledAt: Date): string {
  if (!REPORT_VIEW_ID.test(reportViewId) ||
      !(scheduledAt instanceof Date) || !Number.isFinite(scheduledAt.getTime())) {
    throw new Error('INVALID_REPORT_OCCURRENCE');
  }
  return 'report_' + reportViewId + '_due_' + scheduledAt.toISOString().replace(/[-:.]/g, '');
}

/**
 * Canonical recipient identities must stay outside the BullMQ payload.
 * Send authorization uses a fresh lookup of the report schedule.
 */
export function canonicalReportRecipients(value: unknown): string[] | null {
  const list = String(value ?? '').split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length || list.length > 10 ||
      !list.every((address) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(address) && address.length <= 320)) return null;
  return [...new Set(list)];
}
