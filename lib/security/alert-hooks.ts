import 'server-only';

type AlertSeverity = 'info' | 'warning' | 'critical';

const AUTH_ALERT_THRESHOLD = Number(process.env.APP_ACTIVITY_ALERT_AUTH_FAILURE_THRESHOLD ?? 10);
const WEBHOOK_URL = process.env.APP_ACTIVITY_ALERT_WEBHOOK_URL;

const getCooldownStore = () => {
  const root = globalThis as typeof globalThis & { __activityAlertLastSent?: Map<string, number> };
  if (!root.__activityAlertLastSent) root.__activityAlertLastSent = new Map();
  return root.__activityAlertLastSent;
};

const shouldSend = (dedupeKey: string, cooldownMs = 5 * 60 * 1000) => {
  const store = getCooldownStore();
  const now = Date.now();
  const last = store.get(dedupeKey) ?? 0;
  if (now - last < cooldownMs) return false;
  store.set(dedupeKey, now);
  return true;
};

export async function sendActivityAlert(input: {
  type: string;
  severity: AlertSeverity;
  message: string;
  details?: Record<string, unknown>;
  dedupeKey?: string;
}) {
  if (!WEBHOOK_URL) return;
  if (input.dedupeKey && !shouldSend(input.dedupeKey)) return;

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'bababuilds-erp',
        timestamp: new Date().toISOString(),
        ...input,
      }),
    });
  } catch (error) {
    console.error('Activity alert webhook failed', error);
  }
}

export async function maybeAlertRepeatedAuthFailures(input: {
  reason: string;
  provider: string;
  code: string;
  count: number;
}) {
  if (input.count < AUTH_ALERT_THRESHOLD) return;

  await sendActivityAlert({
    type: 'REPEATED_AUTH_FAILURES',
    severity: 'critical',
    dedupeKey: `auth-failure:${input.reason}:${input.provider}:${input.code}`,
    message: `Repeated auth failures detected (${input.count} occurrences).`,
    details: input,
  });
}
