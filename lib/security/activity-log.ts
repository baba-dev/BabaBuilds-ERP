import 'server-only';

import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
};

const hashHex = (input: string): string => crypto.createHash('sha256').update(input).digest('hex');

const toJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function createTaxOverrideAuditLog(input: {
  workspaceId: string;
  taxRateOverrideId?: string | null;
  action: string;
  decisionSource?: string;
  scopeType: string;
  scopeRef?: string | null;
  rate?: number | null;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  reason?: string | null;
  previousValues?: unknown;
  newValues?: unknown;
  actorUserId?: string | null;
  actorEmail?: string | null;
}) {
  const prev = await prisma.taxRateOverrideAuditLog.findFirst({
    where: { workspaceId: input.workspaceId },
    orderBy: { createdAt: 'desc' },
    select: { entryHash: true },
  });

  const canonicalPayload = {
    workspaceId: input.workspaceId,
    taxRateOverrideId: input.taxRateOverrideId ?? null,
    action: input.action,
    decisionSource: input.decisionSource ?? 'OVERRIDE',
    scopeType: input.scopeType,
    scopeRef: input.scopeRef ?? null,
    rate: input.rate ?? null,
    effectiveFrom: input.effectiveFrom?.toISOString() ?? null,
    effectiveTo: input.effectiveTo?.toISOString() ?? null,
    reason: input.reason ?? null,
    previousValues: input.previousValues ?? null,
    newValues: input.newValues ?? null,
    actorUserId: input.actorUserId ?? null,
    actorEmail: input.actorEmail ?? null,
  };

  const prevHash = prev?.entryHash ?? null;
  const entryHash = hashHex(`${prevHash ?? ''}|${stableStringify(canonicalPayload)}`);

  return prisma.taxRateOverrideAuditLog.create({
    data: {
      workspaceId: input.workspaceId,
      taxRateOverrideId: input.taxRateOverrideId ?? null,
      action: input.action,
      decisionSource: input.decisionSource ?? 'OVERRIDE',
      scopeType: input.scopeType,
      scopeRef: input.scopeRef ?? null,
      rate: input.rate ?? null,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveTo: input.effectiveTo ?? null,
      reason: input.reason ?? null,
      previousValues: input.previousValues === undefined ? Prisma.JsonNull : toJson(input.previousValues),
      newValues: input.newValues === undefined ? Prisma.JsonNull : toJson(input.newValues),
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      prevHash,
      entryHash,
      canonicalPayload,
    },
  });
}

export async function validateTaxOverrideAuditChain(workspaceId?: string) {
  const logs = await prisma.taxRateOverrideAuditLog.findMany({
    where: workspaceId ? { workspaceId } : undefined,
    orderBy: [{ workspaceId: 'asc' }, { createdAt: 'asc' }],
  });

  const violations: Array<{ id: string; workspaceId: string; reason: string }> = [];
  const lastHashByWorkspace = new Map<string, string | null>();

  for (const log of logs) {
    const expectedPrevHash = lastHashByWorkspace.get(log.workspaceId) ?? null;
    if ((log.prevHash ?? null) !== expectedPrevHash) {
      violations.push({ id: log.id, workspaceId: log.workspaceId, reason: 'PREV_HASH_MISMATCH' });
      lastHashByWorkspace.set(log.workspaceId, log.entryHash);
      continue;
    }

    const expectedEntryHash = hashHex(`${log.prevHash ?? ''}|${stableStringify(log.canonicalPayload ?? {})}`);
    if (log.entryHash !== expectedEntryHash) {
      violations.push({ id: log.id, workspaceId: log.workspaceId, reason: 'ENTRY_HASH_MISMATCH' });
    }

    lastHashByWorkspace.set(log.workspaceId, log.entryHash);
  }

  return {
    checked: logs.length,
    valid: violations.length === 0,
    violations,
  };
}
