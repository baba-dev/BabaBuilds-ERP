import { randomUUID } from 'crypto';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ActivityStatus = 'SUCCESS' | 'FAILURE' | 'WARNING' | 'INFO' | (string & {});

export type LogActivityParams = {
  action: string;
  status: ActivityStatus;
  workspaceId: string;
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
]);

const MAX_METADATA_DEPTH = 4;
const MAX_OBJECT_KEYS = 50;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 500;
const MAX_METADATA_BYTES = 8_192;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_IP_LENGTH = 64;
const MAX_CORRELATION_ID_LENGTH = 128;

const sanitizeString = (value: string): string =>
  value.length <= MAX_STRING_LENGTH ? value : `${value.slice(0, MAX_STRING_LENGTH)}${TRUNCATED}`;

const toSafePrimitive = (value: unknown): JsonPrimitive => {
  if (value === null) return null;
  if (typeof value === 'string') return sanitizeString(value);
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
        workspaceId: params.workspaceId,
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
