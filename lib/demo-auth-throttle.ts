import { prisma } from '@/lib/prisma';

export type DemoProvisionBlockReason =
  | 'GLOBAL_CIRCUIT_BREAKER'
  | 'IP_RATE_LIMIT'
  | 'FINGERPRINT_RATE_LIMIT';

export type DemoProvisionDecision = {
  allowed: boolean;
  reason?: DemoProvisionBlockReason;
  retryAfterSeconds?: number;
};

function asPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getClientFingerprint(request: Request): string | null {
  // Optional; can be set by UI/Playwright. Avoid baking in a specific fingerprinting approach.
  const fp = request.headers.get('x-demo-fingerprint')?.trim();
  return fp || null;
}

export async function evaluateDemoProvisionThrottle(params: {
  fifteenMinsAgo: Date;
  globalCount: number;
  globalThreshold: number;
  ip: string | null;
  fingerprint: string | null;
  // When true (valid x-demo-agent-key), we keep the global circuit breaker but bypass per-IP/fingerprint limits.
  bypassPerClientLimits: boolean;
}): Promise<DemoProvisionDecision> {
  if (params.globalCount >= params.globalThreshold) {
    return { allowed: false, reason: 'GLOBAL_CIRCUIT_BREAKER', retryAfterSeconds: 15 * 60 };
  }

  if (params.bypassPerClientLimits) {
    return { allowed: true };
  }

  const ipLimit = asPositiveInt(process.env.DEMO_IP_RATE_LIMIT, 3);
  const fpLimit = asPositiveInt(process.env.DEMO_FINGERPRINT_RATE_LIMIT, 3);

  const [ipCount, fpCount] = await Promise.all([
    params.ip
      ? prisma.demoProvisionAttempt.count({
          where: { ip: params.ip, createdAt: { gte: params.fifteenMinsAgo }, isAllowed: true },
        })
      : Promise.resolve(0),
    params.fingerprint
      ? prisma.demoProvisionAttempt.count({
          where: {
            fingerprint: params.fingerprint,
            createdAt: { gte: params.fifteenMinsAgo },
            isAllowed: true,
          },
        })
      : Promise.resolve(0),
  ]);

  if (params.ip && ipCount >= ipLimit) {
    return { allowed: false, reason: 'IP_RATE_LIMIT', retryAfterSeconds: 15 * 60 };
  }
  if (params.fingerprint && fpCount >= fpLimit) {
    return { allowed: false, reason: 'FINGERPRINT_RATE_LIMIT', retryAfterSeconds: 15 * 60 };
  }

  return { allowed: true };
}

export async function recordDemoProvisionAttempt(data: {
  ip: string | null;
  fingerprint: string | null;
  templateKey: string | null;
  decision: DemoProvisionDecision;
}): Promise<void> {
  await prisma.demoProvisionAttempt.create({
    data: {
      ip: data.ip,
      fingerprint: data.fingerprint,
      templateKey: data.templateKey,
      isAllowed: data.decision.allowed,
      blockReason: data.decision.allowed ? null : data.decision.reason ?? 'GLOBAL_CIRCUIT_BREAKER',
      retryAfterSeconds: data.decision.allowed ? null : data.decision.retryAfterSeconds ?? null,
    },
  });
}

export function throttleToHttpResponse(decision: DemoProvisionDecision): {
  status: number;
  headers?: Record<string, string>;
  body: { error: string; reason: string; retryAfter: number };
} {
  const retryAfter = decision.retryAfterSeconds ?? 15 * 60;
  return {
    status: 429,
    headers: { 'Retry-After': String(retryAfter) },
    body: {
      error: 'Too many demo provisioning attempts. Try again later.',
      reason: decision.reason ?? 'GLOBAL_CIRCUIT_BREAKER',
      retryAfter,
    },
  };
}

