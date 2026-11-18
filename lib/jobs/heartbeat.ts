/**
 * Pure operational telemetry parsing. Never includes Redis credentials, PII, or
 * raw worker job payloads in the admin response.
 */
export type WorkerHeartbeat = 'ready' | 'degraded' | 'stale';

export function parseWorkerHeartbeat(
  value: string | null,
  now = Date.now(),
): { status: WorkerHeartbeat; ageSeconds: number | null } {
  const parsed = /^(ok|degraded):([0-9]{13})$/.exec(value ?? '');
  if (!parsed) return { status: 'stale', ageSeconds: null };
  const ageSeconds = Math.floor((now - Number(parsed[2])) / 1000);
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > 35) {
    return { status: 'stale', ageSeconds: null };
  }
  return { status: parsed[1] === 'ok' ? 'ready' : 'degraded', ageSeconds };
}

export function parseRedisInfo(raw: string, key: string): string | null {
  if (!/^[a-z_]{3,40}$/.test(key)) return null;
  const line = raw.split(/\r?\n/).find(row => row.startsWith(key + ':'));
  return line?.slice(key.length + 1).trim() || null;
}

export function parseRedisInfoNumber(raw: string, key: string): number | null {
  const value = parseRedisInfo(raw, key);
  if (!value || !/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
