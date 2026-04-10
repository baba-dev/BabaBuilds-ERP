import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_PENDING = 'PENDING';
const IDEMPOTENCY_CONSUMED = 'CONSUMED';

function stableStringify(input: unknown): string {
  if (input === null || typeof input !== 'object') return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map((v) => stableStringify(v)).join(',')}]`;
  const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function buildRequestHash(input: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(input)).digest('hex');
}

export type IdempotencyAcquireResult =
  | { kind: 'acquired'; key: string; requestHash: string }
  | { kind: 'replay'; key: string; responseBody: unknown }
  | { kind: 'hash_mismatch'; key: string }
  | { kind: 'in_progress'; key: string };

export async function acquireFinancialIdempotency(params: {
  workspaceId: string;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<IdempotencyAcquireResult> {
  const { workspaceId, operation, idempotencyKey, requestHash } = params;
  const existing = await prisma.financialOperationIdempotency.findUnique({
    where: {
      workspaceId_operation_idempotencyKey: {
        workspaceId,
        operation,
        idempotencyKey,
      },
    },
  });

  if (existing) {
    if (existing.requestHash !== requestHash) return { kind: 'hash_mismatch', key: idempotencyKey };
    if (existing.status === IDEMPOTENCY_CONSUMED) {
      return { kind: 'replay', key: idempotencyKey, responseBody: existing.responseBody };
    }
    return { kind: 'in_progress', key: idempotencyKey };
  }

  try {
    await prisma.financialOperationIdempotency.create({
      data: {
        workspaceId,
        operation,
        idempotencyKey,
        requestHash,
        status: IDEMPOTENCY_PENDING,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
    });
    return { kind: 'acquired', key: idempotencyKey, requestHash };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { kind: 'in_progress', key: idempotencyKey };
    }
    throw error;
  }
}

export async function consumeFinancialIdempotency(params: {
  workspaceId: string;
  operation: string;
  idempotencyKey: string;
  responseBody: unknown;
}) {
  const { workspaceId, operation, idempotencyKey, responseBody } = params;
  await prisma.financialOperationIdempotency.update({
    where: {
      workspaceId_operation_idempotencyKey: {
        workspaceId,
        operation,
        idempotencyKey,
      },
    },
    data: {
      status: IDEMPOTENCY_CONSUMED,
      responseBody: responseBody as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
    },
  });
}

export async function releaseFinancialIdempotency(params: {
  workspaceId: string;
  operation: string;
  idempotencyKey: string;
}) {
  const { workspaceId, operation, idempotencyKey } = params;
  await prisma.financialOperationIdempotency.delete({
    where: {
      workspaceId_operation_idempotencyKey: {
        workspaceId,
        operation,
        idempotencyKey,
      },
    },
  }).catch(() => undefined);
}
