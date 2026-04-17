import 'server-only';

import crypto, { randomUUID } from 'crypto';
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

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ActivityStatus = 'SUCCESS' | 'FAILURE' | 'WARNING' | 'INFO' | (string & {});

export type LogActivityParams = {
  action: string;
  status: ActivityStatus;
  workspaceId?: string | null;
  actor?: {
    userId?: string | null;
    email?: string | null;
  };
  entity?: {
    type: string;
    id?: string | null;
  };
  metadata?: Record<string, unknown>;
  request?: Request;
  headers?: Headers;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
};

export type LogSensitivePayrollActivityParams = Omit<LogActivityParams, 'action'> & {
  action: `payroll.${string}`;
};

const REDACTED = '[REDACTED]';
const TRUNCATED = '[TRUNCATED]';
const OMITTED = '[OMITTED]';

const DENYLIST_KEYS = new Set([
  'password',
  'passphrase',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'apikey',
  'authorization',
  'cookie',
  'set-cookie',
  'clientSecret',
  'privateKey',
  'signature',
  'otp',
  'pan',
  'panNumber',
  'taxId',
  'taxIdentifier',
  'gstin',
  'ein',
  'ssn',
  'sin',
  'accountNumber',
  'iban',
  'ifsc',
  'swift',
  'routingNumber',
  'salary',
  'payroll',
]);

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /\b[A-Z]{5}[0-9]{4}[A-Z]\b/, // PAN (India)
  /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\b/, // IBAN
  /\b[A-Z]{4}0[A-Z0-9]{6}\b/, // IFSC
  /\b[0-9]{9,18}\b/, // bank/account-like long numeric strings
];

const MAX_METADATA_DEPTH = 4;
const MAX_OBJECT_KEYS = 50;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 500;
const MAX_METADATA_BYTES = 8_192;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_IP_LENGTH = 64;
const MAX_CORRELATION_ID_LENGTH = 128;
const PAYROLL_METADATA_REDACT_KEYS = new Set([
  'grossPay',
  'netPay',
  'basicPay',
  'deductions',
  'allowances',
  'bankAccount',
  'bankAccountNumber',
  'bankName',
  'routingNumber',
  'ifsc',
  'iban',
  'salary',
  'ctc',
  'employeeCompensation',
].map((key) => key.toLowerCase()));

const sanitizeString = (value: string): string =>
  value.length <= MAX_STRING_LENGTH ? value : `${value.slice(0, MAX_STRING_LENGTH)}${TRUNCATED}`;

const sanitizePotentialSensitiveString = (value: string): string => {
  const sanitized = sanitizeString(value);
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(sanitized)) ? REDACTED : sanitized;
};

const toSafePrimitive = (value: unknown): JsonPrimitive => {
  if (value === null) return null;
  if (typeof value === 'string') return sanitizePotentialSensitiveString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const sanitizeMetadataNode = (value: unknown, depth: number): JsonValue => {
  if (depth > MAX_METADATA_DEPTH) return OMITTED;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeMetadataNode(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const entries = Object.entries(obj).slice(0, MAX_OBJECT_KEYS);
    const sanitizedEntries: Array<[string, JsonValue]> = entries.map(([key, raw]) => {
      if (DENYLIST_KEYS.has(key.toLowerCase())) {
        return [key, REDACTED];
      }
      return [key, sanitizeMetadataNode(raw, depth + 1)];
    });
    return Object.fromEntries(sanitizedEntries);
  }

  return toSafePrimitive(value);
};

export const sanitizeMetadata = (metadata?: Record<string, unknown>): Prisma.InputJsonValue | undefined => {
  if (!metadata) return undefined;

  const sanitized = sanitizeMetadataNode(metadata, 0);
  const serialized = JSON.stringify(sanitized);

  if (serialized.length <= MAX_METADATA_BYTES) {
    return sanitized as Prisma.InputJsonValue;
  }

  return {
    note: TRUNCATED,
    preview: serialized.slice(0, MAX_METADATA_BYTES),
  } as Prisma.InputJsonValue;
};

const redactPayrollMetadata = (metadata?: Record<string, unknown>): Record<string, unknown> | undefined => {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (PAYROLL_METADATA_REDACT_KEYS.has(key.toLowerCase())) {
        return [key, REDACTED];
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return [key, redactPayrollMetadata(value as Record<string, unknown>) ?? {}];
      }
      return [key, value];
    }),
  );
};

const firstHeader = (headers: Headers, candidates: string[]): string | null => {
  for (const key of candidates) {
    const value = headers.get(key);
    if (value) return value;
  }
  return null;
};

const normalizeIp = (value: string | null): string | null => {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  if (!first) return null;
  return first.slice(0, MAX_IP_LENGTH);
};

export const extractRequestContext = (requestOrHeaders?: Request | Headers) => {
  if (!requestOrHeaders) {
    return {
      ipAddress: null,
      userAgent: null,
      correlationId: null,
    };
  }

  const headers = requestOrHeaders instanceof Headers ? requestOrHeaders : requestOrHeaders.headers;
  const ipAddress = normalizeIp(
    firstHeader(headers, ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'])
  );
  const userAgent = firstHeader(headers, ['user-agent'])?.slice(0, MAX_USER_AGENT_LENGTH) ?? null;
  const correlationId =
    firstHeader(headers, ['x-request-id', 'x-correlation-id'])?.slice(0, MAX_CORRELATION_ID_LENGTH) ?? null;

  return {
    ipAddress,
    userAgent,
    correlationId,
  };
};

export const logActivity = async (params: LogActivityParams): Promise<string | null> => {
  try {
    const context = extractRequestContext(params.request ?? params.headers);
    const correlationId =
      params.correlationId?.slice(0, MAX_CORRELATION_ID_LENGTH) ?? context.correlationId ?? randomUUID();

    const created = await prisma.appActivityLog.create({
      data: {
        workspaceId: params.workspaceId ?? null,
        action: sanitizeString(params.action),
        status: sanitizeString(params.status),
        actorUserId: params.actor?.userId ?? null,
        actorEmail: params.actor?.email ?? null,
        entityType: params.entity?.type ? sanitizeString(params.entity.type) : null,
        entityId: params.entity?.id ? sanitizeString(params.entity.id) : null,
        metadata: sanitizeMetadata(params.metadata),
        ipAddress: (params.ipAddress ?? context.ipAddress)?.slice(0, MAX_IP_LENGTH) ?? null,
        userAgent: (params.userAgent ?? context.userAgent)?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
        correlationId,
      },
    });

    return created.id;
  } catch (error) {
    console.error('Activity logging failed (non-blocking):', error);
    return null;
  }
};

export const logSensitivePayrollActivity = async (
  params: LogSensitivePayrollActivityParams,
): Promise<string | null> => {
  return logActivity({
    ...params,
    metadata: redactPayrollMetadata(params.metadata),
  });
};
