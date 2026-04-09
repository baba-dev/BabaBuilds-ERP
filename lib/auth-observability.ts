import { maybeAlertRepeatedAuthFailures } from "@/lib/security/alert-hooks";

type AuthFailureRecord = {
  count: number;
  lastSeenAt: string;
  provider: string;
  code: string;
  reason: string;
};

const REQUIRED_AUTH_ENV_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
] as const;

function getObservabilityStore() {
  const globalStore = globalThis as typeof globalThis & {
    __authFailureCounts?: Map<string, AuthFailureRecord>;
  };

  if (!globalStore.__authFailureCounts) {
    globalStore.__authFailureCounts = new Map<string, AuthFailureRecord>();
  }

  return globalStore.__authFailureCounts;
}

export function validateAuthEnvOrThrow() {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  const missing = REQUIRED_AUTH_ENV_VARS.filter((envName) => {
    const value = process.env[envName];
    return !value || value.trim().length === 0;
  });

  if (missing.length > 0) {
    const message = `[AuthConfig] Missing required environment variable(s): ${missing.join(", ")}. Refusing to boot so OAuth does not fail at runtime.`;
    console.error(message);
    throw new Error(message);
  }

  try {
    new URL(process.env.NEXTAUTH_URL as string);
  } catch {
    const message = `[AuthConfig] NEXTAUTH_URL must be a valid absolute URL. Current value: "${process.env.NEXTAUTH_URL}".`;
    console.error(message);
    throw new Error(message);
  }
}

export function recordAuthFailure(input: { reason: string; code: string; provider?: string }) {
  const store = getObservabilityStore();
  const provider = input.provider || "unknown";
  const normalizedReason = input.reason || "unknown";
  const key = `${normalizedReason}::${provider}::${input.code}`;
  const current = store.get(key);

  const nextRecord = {
    count: (current?.count || 0) + 1,
    provider,
    code: input.code,
    reason: normalizedReason,
    lastSeenAt: new Date().toISOString(),
  };

  store.set(key, nextRecord);
  void maybeAlertRepeatedAuthFailures(nextRecord);
}

export function getAuthFailureMetrics() {
  return Array.from(getObservabilityStore().values()).sort((a, b) => b.count - a.count);
}
