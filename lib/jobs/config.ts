/** Explicit standalone-worker controls. Does not connect or log a Redis URL. */
import { loadRedisConfig } from '@/lib/redis/config';

export type ErpJobsConfig = {
  enabled: boolean;
  workerEnabled: boolean;
  inAppDeadlineEnabled: boolean;
  /** Explicit, exact ID of the single internal canary workspace. Empty means no canary. */
  inAppDeadlineWorkspaceIds: readonly string[];
  namespace: string;
  endpoint: string | null;
};

function enabledFlag(env: NodeJS.ProcessEnv, name: string): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw || raw === 'false') return false;
  if (raw === 'true') return true;
  throw new Error('Invalid boolean jobs flag: ' + name);
}

/** Canary may target exactly one explicit workspace, never wildcard/all/CSV lists. */
export function parseDeadlineCanaryWorkspaces(raw: string | undefined): readonly string[] {
  const value = raw?.trim() ?? '';
  if (!value) return [];
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(value)) {
    throw new Error('ERP_REDIS_INAPP_DEADLINE_WORKSPACE_IDS must be one valid workspace ID');
  }
  return [value];
}

export function loadErpJobsConfig(env: NodeJS.ProcessEnv = process.env): ErpJobsConfig {
  const redis = loadRedisConfig(env);
  const workerEnabled = enabledFlag(env, 'ERP_REDIS_JOB_WORKER_ENABLED');
  const inAppDeadlineEnabled = enabledFlag(env, 'ERP_REDIS_INAPP_DEADLINE_ENABLED');
  const inAppDeadlineWorkspaceIds = parseDeadlineCanaryWorkspaces(
    env.ERP_REDIS_INAPP_DEADLINE_WORKSPACE_IDS,
  );
  if (inAppDeadlineEnabled && inAppDeadlineWorkspaceIds.length !== 1) {
    throw new Error('Explicit ERP_REDIS_INAPP_DEADLINE_WORKSPACE_IDS required for pilot');
  }
  if (inAppDeadlineEnabled && !workerEnabled) {
    throw new Error('ERP_REDIS_JOB_WORKER_ENABLED required for deadline pilot');
  }
  if ((workerEnabled || inAppDeadlineEnabled) && !redis.features.jobs) {
    throw new Error('ERP_REDIS_JOBS_ENABLED required before worker or pilot');
  }
  const raw = redis.features.jobs ? env.ERP_REDIS_JOB_URL?.trim() : null;
  if (redis.features.jobs) {
    let url: URL;
    try { url = new URL(raw || ''); }
    catch { throw new Error('Invalid ERP_REDIS_JOB_URL'); }
    if (url.protocol !== 'redis:' || url.hostname !== '127.0.0.1' ||
        url.port !== '6387' || url.username !== 'erp_jobs' || !url.password ||
        !['', '/', '/0'].includes(url.pathname) || url.search || url.hash) {
      throw new Error('ERP_REDIS_JOB_URL must point to isolated loopback ERP jobs Redis');
    }
  }
  return {
    enabled: redis.features.jobs,
    workerEnabled, inAppDeadlineEnabled, inAppDeadlineWorkspaceIds,
    namespace: redis.namespace,
    endpoint: raw ?? null,
  };
}

export function inAppDeadlineQueueEnabled(
  workspaceId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // Misconfiguration never triggers the queued pilot; retain legacy behavior.
  try {
    const config = loadErpJobsConfig(env);
    return config.inAppDeadlineEnabled &&
      config.inAppDeadlineWorkspaceIds.includes(workspaceId);
  }
  catch { return false; }
}
