import type { prisma as defaultPrisma } from "@/lib/prisma";

export type DemoProvisionThrottleReason =
  | "allowed"
  | "global_rate_limit"
  | "ip_rate_limit"
  | "fingerprint_rate_limit";

export type DemoProvisionThrottleDecision = {
  allowed: boolean;
  reason: DemoProvisionThrottleReason;
  retryAfterSeconds: number;
};

type AttemptRecord = {
  createdAt: Date;
};

type PrismaLike = {
  workspace: {
    count: (args: {
      where: {
        name: string;
        createdAt: {
          gte: Date;
        };
      };
    }) => Promise<number>;
  };
  demoProvisionAttempt: {
    findMany: (args: {
      where: {
        createdAt: { gte: Date };
        ip?: string;
        fingerprint?: string;
      };
      select: {
        createdAt: true;
      };
      orderBy: {
        createdAt: "asc";
      };
    }) => Promise<AttemptRecord[]>;
    create: (args: {
      data: {
        ip: string;
        fingerprint: string | null;
        reason: DemoProvisionThrottleReason;
        allowed: boolean;
      };
    }) => Promise<unknown>;
  };
};

const WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_RETRY_AFTER_SECONDS = Math.ceil(WINDOW_MS / 1000);

function configuredNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? String(fallback));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toRetryAfterSeconds(attempts: AttemptRecord[], now: number): number {
  const oldest = attempts[0];
  if (!oldest) {
    return DEFAULT_RETRY_AFTER_SECONDS;
  }

  const retryAt = oldest.createdAt.getTime() + WINDOW_MS;
  return Math.max(1, Math.ceil((retryAt - now) / 1000));
}

export async function evaluateDemoProvisionThrottle(
  input: { ip: string; fingerprint?: string | null },
  prismaClient: PrismaLike,
): Promise<DemoProvisionThrottleDecision> {
  const now = Date.now();
  const windowStart = new Date(now - WINDOW_MS);

  const threshold = configuredNumber(process.env.DEMO_CIRCUIT_BREAKER_THRESHOLD, 10);
  const ipLimit = configuredNumber(process.env.DEMO_IP_RATE_LIMIT, 3);
  const fingerprintLimit = configuredNumber(process.env.DEMO_FINGERPRINT_RATE_LIMIT, 3);

  const recentDemos = await prismaClient.workspace.count({
    where: {
      name: "BabaBuilds Demo Enterprise",
      createdAt: { gte: windowStart },
    },
  });

  if (recentDemos >= threshold) {
    return {
      allowed: false,
      reason: "global_rate_limit",
      retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
    };
  }

  const ipAttempts = await prismaClient.demoProvisionAttempt.findMany({
    where: {
      ip: input.ip,
      createdAt: { gte: windowStart },
    },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (ipAttempts.length >= ipLimit) {
    return {
      allowed: false,
      reason: "ip_rate_limit",
      retryAfterSeconds: toRetryAfterSeconds(ipAttempts, now),
    };
  }

  const fingerprint = input.fingerprint?.trim() || null;
  if (fingerprint) {
    const fingerprintAttempts = await prismaClient.demoProvisionAttempt.findMany({
      where: {
        fingerprint,
        createdAt: { gte: windowStart },
      },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    if (fingerprintAttempts.length >= fingerprintLimit) {
      return {
        allowed: false,
        reason: "fingerprint_rate_limit",
        retryAfterSeconds: toRetryAfterSeconds(fingerprintAttempts, now),
      };
    }
  }

  return {
    allowed: true,
    reason: "allowed",
    retryAfterSeconds: 0,
  };
}

export async function recordDemoProvisionAttempt(
  input: { ip: string; fingerprint?: string | null; decision: DemoProvisionThrottleDecision },
  prismaClient: PrismaLike,
): Promise<void> {
  await prismaClient.demoProvisionAttempt.create({
    data: {
      ip: input.ip,
      fingerprint: input.fingerprint?.trim() || null,
      reason: input.decision.reason,
      allowed: input.decision.allowed,
    },
  });
}

export type DemoProvisionPrismaClient = typeof defaultPrisma;
