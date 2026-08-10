import crypto from 'node:crypto';
import { z } from 'zod';
import {
  isMutatingTool,
  parseToolArguments,
  type ToolName,
  ToolPolicyError,
} from '@/lib/ai/chat/tool-policy';

const TOKEN_TTL_SECONDS = 120;
const MAX_CLOCK_SKEW_SECONDS = 5;

const payloadSchema = z.object({
  version: z.literal(1),
  userId: z.string().min(1).max(128),
  workspaceId: z.string().min(1).max(128),
  toolName: z.string().min(1).max(128),
  args: z.record(z.string(), z.unknown()),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  nonce: z.string().uuid(),
}).strict();

export type ToolConfirmationPayload = Omit<z.infer<typeof payloadSchema>, 'toolName'> & {
  toolName: ToolName;
};

export class ToolConfirmationError extends Error {
  public readonly reason: 'invalid' | 'expired' | 'unavailable';

  constructor(
    message: string,
    reason: 'invalid' | 'expired' | 'unavailable' = 'invalid',
  ) {
    super(message);
    this.name = 'ToolConfirmationError';
    this.reason = reason;
  }
}

function signingSecret(): string {
  const secret = process.env.AI_TOOL_CONFIRMATION_SECRET?.trim() || '';
  if (secret.length < 32) {
    throw new ToolConfirmationError(
      'AI mutation confirmation is unavailable because its signing secret is not configured',
      'unavailable',
    );
  }
  return secret;
}

function sign(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', signingSecret())
    .update(encodedPayload, 'utf8')
    .digest('base64url');
}

function safeSignatureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function createToolConfirmationToken(input: {
  userId: string;
  workspaceId: string;
  toolName: string;
  args: unknown;
  now?: Date;
}): { token: string; expiresAt: string; nonce: string } {
  if (!isMutatingTool(input.toolName)) {
    throw new ToolPolicyError('Only allowlisted mutations can be confirmed');
  }

  const args = parseToolArguments(input.toolName, input.args);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  const payload: ToolConfirmationPayload = {
    version: 1,
    userId: input.userId,
    workspaceId: input.workspaceId,
    toolName: input.toolName,
    args,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + TOKEN_TTL_SECONDS,
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return {
    token: `${encodedPayload}.${sign(encodedPayload)}`,
    expiresAt: new Date(payload.expiresAt * 1_000).toISOString(),
    nonce: payload.nonce,
  };
}

export function verifyToolConfirmationToken(
  token: string,
  now: Date = new Date(),
): ToolConfirmationPayload {
  if (!token || token.length > 12_000) {
    throw new ToolConfirmationError('Invalid AI mutation confirmation token');
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new ToolConfirmationError('Invalid AI mutation confirmation token');
  }
  const [encodedPayload, signature] = parts;
  const expectedSignature = sign(encodedPayload);
  if (!safeSignatureEqual(signature, expectedSignature)) {
    throw new ToolConfirmationError('Invalid AI mutation confirmation signature');
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new ToolConfirmationError('Invalid AI mutation confirmation payload');
  }

  const parsed = payloadSchema.safeParse(candidate);
  if (!parsed.success || !isMutatingTool(parsed.data.toolName)) {
    throw new ToolConfirmationError('Invalid AI mutation confirmation payload');
  }

  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (parsed.data.issuedAt > nowSeconds + MAX_CLOCK_SKEW_SECONDS) {
    throw new ToolConfirmationError('AI mutation confirmation was issued in the future');
  }
  if (
    parsed.data.expiresAt <= nowSeconds ||
    parsed.data.expiresAt - parsed.data.issuedAt !== TOKEN_TTL_SECONDS
  ) {
    throw new ToolConfirmationError('AI mutation confirmation has expired', 'expired');
  }

  const normalizedArgs = parseToolArguments(parsed.data.toolName, parsed.data.args);
  return {
    ...parsed.data,
    toolName: parsed.data.toolName,
    args: normalizedArgs,
  };
}
