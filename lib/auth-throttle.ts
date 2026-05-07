import { createHash } from "crypto";
import { verifyTurnstileToken } from "@/lib/turnstile";

export type AuthThrottleDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  reason:
    | "allowed"
    | "ip_cooldown"
    | "email_cooldown"
    | "ip_rate_limit"
    | "email_rate_limit"
    | "turnstile_required"
    | "turnstile_failed";
  requiresTurnstile: boolean;
};

type Bucket = {
  attempts: number[];
  cooldownUntil: number;
};

type EvaluateInput = {
  ip: string;
  email: string;
  fingerprint?: string | null;
  turnstileToken?: string | null;
};

const WINDOW_MS = 10 * 60 * 1000;
const IP_LIMIT = 8;
const EMAIL_LIMIT = 5;
const COOLDOWN_MS = 15 * 60 * 1000;
const TURNSTILE_TRIGGER_ATTEMPTS = 3;
const TURNSTILE_RETRY_AFTER_SECONDS = 120;

function getStore() {
  const g = globalThis as typeof globalThis & {
    __authThrottleIp?: Map<string, Bucket>;
    __authThrottleEmail?: Map<string, Bucket>;
    __authThrottleFingerprint?: Map<string, Bucket>;
  };

  g.__authThrottleIp ||= new Map<string, Bucket>();
  g.__authThrottleEmail ||= new Map<string, Bucket>();
  g.__authThrottleFingerprint ||= new Map<string, Bucket>();

  return {
    ip: g.__authThrottleIp,
    email: g.__authThrottleEmail,
    fingerprint: g.__authThrottleFingerprint,
  };
}

function getBucket(store: Map<string, Bucket>, key: string, now: number) {
  const existing = store.get(key);
  if (!existing) {
    const created: Bucket = { attempts: [], cooldownUntil: 0 };
    store.set(key, created);
    return created;
  }

  existing.attempts = existing.attempts.filter((ts) => now - ts < WINDOW_MS);
  return existing;
}

function hashEmail(email: string) {
  return createHash("sha256").update(email.toLowerCase()).digest("hex");
}

export async function evaluateEmailSignInThrottle(input: EvaluateInput): Promise<AuthThrottleDecision> {
  const now = Date.now();
  const stores = getStore();

  const normalizedEmail = input.email.trim().toLowerCase();
  const emailKey = hashEmail(normalizedEmail);
  const ipBucket = getBucket(stores.ip, input.ip, now);
  const emailBucket = getBucket(stores.email, emailKey, now);

  if (ipBucket.cooldownUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((ipBucket.cooldownUntil - now) / 1000)),
      reason: "ip_cooldown",
      requiresTurnstile: false,
    };
  }

  if (emailBucket.cooldownUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((emailBucket.cooldownUntil - now) / 1000)),
      reason: "email_cooldown",
      requiresTurnstile: false,
    };
  }

  const fingerprintKey = (input.fingerprint || "").trim().toLowerCase();
  const turnstileEnabled = Boolean(process.env.TURNSTILE_SECRET_KEY);
  const fingerprintBucket = fingerprintKey ? getBucket(stores.fingerprint, fingerprintKey, now) : null;

  const repeatedFingerprint = Boolean(fingerprintBucket && fingerprintBucket.attempts.length >= TURNSTILE_TRIGGER_ATTEMPTS);
  const repeatedIp = ipBucket.attempts.length >= TURNSTILE_TRIGGER_ATTEMPTS;
  const needsTurnstile = turnstileEnabled && (repeatedFingerprint || repeatedIp);

  if (needsTurnstile) {
    if (!input.turnstileToken) {
      return {
        allowed: false,
        retryAfterSeconds: TURNSTILE_RETRY_AFTER_SECONDS,
        reason: "turnstile_required",
        requiresTurnstile: true,
      };
    }

    const verified = await verifyTurnstileToken(input.turnstileToken, input.ip);
    if (!verified) {
      return {
        allowed: false,
        retryAfterSeconds: TURNSTILE_RETRY_AFTER_SECONDS,
        reason: "turnstile_failed",
        requiresTurnstile: true,
      };
    }
  }

  if (ipBucket.attempts.length >= IP_LIMIT) {
    ipBucket.cooldownUntil = now + COOLDOWN_MS;
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(COOLDOWN_MS / 1000),
      reason: "ip_rate_limit",
      requiresTurnstile: false,
    };
  }

  if (emailBucket.attempts.length >= EMAIL_LIMIT) {
    emailBucket.cooldownUntil = now + COOLDOWN_MS;
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(COOLDOWN_MS / 1000),
      reason: "email_rate_limit",
      requiresTurnstile: false,
    };
  }

  ipBucket.attempts.push(now);
  emailBucket.attempts.push(now);
  if (fingerprintBucket) {
    fingerprintBucket.attempts.push(now);
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    reason: "allowed",
    requiresTurnstile: false,
  };
}
