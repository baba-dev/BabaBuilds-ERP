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

function getRequiredEnvValue(envName: (typeof REQUIRED_AUTH_ENV_VARS)[number]) {
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

function getRequiredProviderEnv() {
  const required: string[] = [...ALWAYS_REQUIRED_AUTH_ENV_VARS];

  const googleEnabled = isProviderEnabled("AUTH_GOOGLE_ENABLED", GOOGLE_REQUIRED_AUTH_ENV_VARS);
  const emailEnabled = isProviderEnabled("AUTH_EMAIL_ENABLED", EMAIL_REQUIRED_AUTH_ENV_VARS);

  if (googleEnabled) {
    required.push(...GOOGLE_REQUIRED_AUTH_ENV_VARS);
  }

  if (emailEnabled) {
    required.push(...EMAIL_REQUIRED_AUTH_ENV_VARS);
  }

  return required;
}

function getProviderModeLabel() {
  const googleEnabled = isProviderEnabled("AUTH_GOOGLE_ENABLED", GOOGLE_REQUIRED_AUTH_ENV_VARS);
  const emailEnabled = isProviderEnabled("AUTH_EMAIL_ENABLED", EMAIL_REQUIRED_AUTH_ENV_VARS);

  if (googleEnabled && emailEnabled) return "google+email";
  if (googleEnabled) return "google-only";
  if (emailEnabled) return "email-only";
  return "none";
}

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

  const missing = REQUIRED_AUTH_ENV_VARS.filter((envName) => getRequiredEnvValue(envName).length === 0);
  const requiredEnvVars = getRequiredProviderEnv();
  const missing = getMissingEnv(requiredEnvVars);

  if (missing.length > 0) {
    const mode = getProviderModeLabel();
    const message = `[AuthConfig] Missing required environment variable(s) for mode=${mode}: ${missing.join(", ")}. Refusing to boot so auth providers do not fail at runtime.`;
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

  const emailServerPort = Number(getRequiredEnvValue("EMAIL_SERVER_PORT"));
  if (!Number.isInteger(emailServerPort) || emailServerPort < MIN_PORT || emailServerPort > MAX_PORT) {
    const rawPortValue = process.env.EMAIL_SERVER_PORT;
    const message = `[AuthConfig] Invalid environment variable EMAIL_SERVER_PORT: expected an integer between ${MIN_PORT} and ${MAX_PORT}, received "${rawPortValue}".`;
    console.error(message);
    throw new Error(message);
  }

  const emailFrom = getRequiredEnvValue("EMAIL_FROM");
  if (!isValidEmailAddress(emailFrom)) {
    const message = `[AuthConfig] Invalid environment variable EMAIL_FROM: expected an email address like "no-reply@example.com" or "App Name <no-reply@example.com>", received "${process.env.EMAIL_FROM}".`;
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
