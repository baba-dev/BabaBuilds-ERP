import { maybeAlertRepeatedAuthFailures } from "@/lib/security/alert-hooks";

type AuthFailureRecord = {
  count: number;
  lastSeenAt: string;
  provider: string;
  code: string;
  reason: string;
};

type AuthThrottleRecord = {
  ip: string;
  emailHash: string;
  fingerprint: string | null;
  decision: string;
  retryAfterSeconds: number;
  requiresTurnstile: boolean;
  at: string;
};

const ALWAYS_REQUIRED_AUTH_ENV_VARS = ["NEXTAUTH_URL", "NEXTAUTH_SECRET"] as const;
const GOOGLE_REQUIRED_AUTH_ENV_VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
const EMAIL_REQUIRED_AUTH_ENV_VARS = [
  "EMAIL_SERVER_HOST",
  "EMAIL_SERVER_PORT",
  "EMAIL_SERVER_USER",
  "EMAIL_SERVER_PASSWORD",
  "EMAIL_FROM",
] as const;

const MIN_PORT = 1;
const MAX_PORT = 65535;

function getRequiredEnvValue(envName: string) {
  const value = process.env[envName];
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmailAddress(input: string) {
  const plainEmailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  const namedEmailPattern = /^[^<>\r\n]+<\s*([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)\s*>$/;

  if (plainEmailPattern.test(input)) {
    return true;
  }

  const namedMatch = input.match(namedEmailPattern);
  return Boolean(namedMatch && plainEmailPattern.test(namedMatch[1]));
}

function hasNonEmptyEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function isProviderEnabled(toggleEnvName: string, inferredFromEnvVars: readonly string[]) {
  const toggle = process.env[toggleEnvName]?.trim().toLowerCase();

  if (toggle === "true" || toggle === "1" || toggle === "yes" || toggle === "on") {
    return true;
  }

  if (toggle === "false" || toggle === "0" || toggle === "no" || toggle === "off") {
    return false;
  }

  return inferredFromEnvVars.some((envName) => hasNonEmptyEnv(envName));
}

function getMissingEnv(envNames: readonly string[]) {
  return envNames.filter((envName) => !hasNonEmptyEnv(envName));
}

function getProviderFlags() {
  const googleEnabled = isProviderEnabled("AUTH_GOOGLE_ENABLED", GOOGLE_REQUIRED_AUTH_ENV_VARS);
  const emailEnabled = isProviderEnabled("AUTH_EMAIL_ENABLED", EMAIL_REQUIRED_AUTH_ENV_VARS);

  return { googleEnabled, emailEnabled };
}

function getRequiredProviderEnv() {
  const required: string[] = [...ALWAYS_REQUIRED_AUTH_ENV_VARS];
  const { googleEnabled, emailEnabled } = getProviderFlags();

  if (googleEnabled) {
    required.push(...GOOGLE_REQUIRED_AUTH_ENV_VARS);
  }

  if (emailEnabled) {
    required.push(...EMAIL_REQUIRED_AUTH_ENV_VARS);
  }

  return required;
}

function getProviderModeLabel() {
  const { googleEnabled, emailEnabled } = getProviderFlags();

  if (googleEnabled && emailEnabled) return "google+email";
  if (googleEnabled) return "google-only";
  if (emailEnabled) return "email-only";
  return "none";
}

function getObservabilityStore() {
  const globalStore = globalThis as typeof globalThis & {
    __authFailureCounts?: Map<string, AuthFailureRecord>;
    __authThrottleEvents?: AuthThrottleRecord[];
  };

  if (!globalStore.__authFailureCounts) {
    globalStore.__authFailureCounts = new Map<string, AuthFailureRecord>();
  }

  if (!globalStore.__authThrottleEvents) {
    globalStore.__authThrottleEvents = [];
  }

  return {
    failures: globalStore.__authFailureCounts,
    throttleEvents: globalStore.__authThrottleEvents,
  };
}

export function validateAuthEnvOrThrow() {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  const requiredEnvVars = getRequiredProviderEnv();
  const missing = getMissingEnv(requiredEnvVars);

  if (missing.length > 0) {
    const mode = getProviderModeLabel();
    const message = `[AuthConfig] Missing required environment variable(s) for mode=${mode}: ${missing.join(", ")}. Refusing to boot so auth providers do not fail at runtime.`;
    console.error(message);
    throw new Error(message);
  }

  try {
    const authUrl = new URL(getRequiredEnvValue("NEXTAUTH_URL"));
    if (!["http:", "https:"].includes(authUrl.protocol) || authUrl.username || authUrl.password) {
      throw new Error("Invalid auth origin");
    }
  } catch {
    // Configuration errors must never echo potentially credential-bearing URL strings.
    const message = "[AuthConfig] NEXTAUTH_URL must be a credential-free HTTP(S) absolute URL (value redacted).";
    console.error(message);
    throw new Error(message);
  }

  const { emailEnabled } = getProviderFlags();
  if (!emailEnabled) {
    return;
  }

  const emailServerPort = Number(getRequiredEnvValue("EMAIL_SERVER_PORT"));
  if (!Number.isInteger(emailServerPort) || emailServerPort < MIN_PORT || emailServerPort > MAX_PORT) {
    const message = `[AuthConfig] Invalid environment variable EMAIL_SERVER_PORT: expected an integer between ${MIN_PORT} and ${MAX_PORT} (value redacted).`;
    console.error(message);
    throw new Error(message);
  }

  const emailFrom = getRequiredEnvValue("EMAIL_FROM");
  if (!isValidEmailAddress(emailFrom)) {
    const message = '[AuthConfig] Invalid environment variable EMAIL_FROM: expected a valid sender email address (value redacted).';
    console.error(message);
    throw new Error(message);
  }
}

export function recordAuthFailure(input: { reason: string; code: string; provider?: string }) {
  const store = getObservabilityStore().failures;
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
  return Array.from(getObservabilityStore().failures.values()).sort((a, b) => b.count - a.count);
}

export function recordAuthThrottleAttempt(event: Omit<AuthThrottleRecord, "at">) {
  const store = getObservabilityStore().throttleEvents;
  store.push({
    ...event,
    at: new Date().toISOString(),
  });

  if (store.length > 1000) {
    store.splice(0, store.length - 1000);
  }
}

export function getAuthThrottleMetrics() {
  return [...getObservabilityStore().throttleEvents];
}

type PasswordAuthAuditEvent = {
  email: string;
  userId?: string | null;
  outcome: "success" | "failure" | "locked" | "rate_limited" | "reset_requested" | "reset_completed";
  ip?: string | null;
  retryAfterSeconds?: number;
  at: string;
};

export function recordPasswordAuthAuditEvent(event: Omit<PasswordAuthAuditEvent, "at">) {
  const globalStore = globalThis as typeof globalThis & { __passwordAuthAuditEvents?: PasswordAuthAuditEvent[] };
  if (!globalStore.__passwordAuthAuditEvents) globalStore.__passwordAuthAuditEvents = [];
  globalStore.__passwordAuthAuditEvents.push({ ...event, at: new Date().toISOString() });
  if (globalStore.__passwordAuthAuditEvents.length > 1000) {
    globalStore.__passwordAuthAuditEvents.splice(0, globalStore.__passwordAuthAuditEvents.length - 1000);
  }
}

export function getPasswordAuthAuditEvents() {
  const globalStore = globalThis as typeof globalThis & { __passwordAuthAuditEvents?: PasswordAuthAuditEvent[] };
  return [...(globalStore.__passwordAuthAuditEvents ?? [])];
}
