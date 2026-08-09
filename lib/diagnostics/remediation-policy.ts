import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";

const restartWebSchema = z.object({
  version: z.literal(1),
  action: z.literal("RESTART_WEB"),
}).strict();

const blockIpv4Schema = z.object({
  version: z.literal(1),
  action: z.literal("BLOCK_IPV4"),
  ip: z.string().refine((value) => isIP(value) === 4, "A canonical IPv4 address is required"),
}).strict();

export const remediationActionSchema = z.discriminatedUnion("action", [
  restartWebSchema,
  blockIpv4Schema,
]);

export type RemediationAction = z.infer<typeof remediationActionSchema>;

export const approvalEnvelopeSchema = z.object({
  version: z.literal(1),
  remediationId: z.string().min(1).max(128),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  nonce: z.string().min(16).max(128),
  signature: z.string().min(80).max(256).regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).strict();

export type ApprovalEnvelope = z.infer<typeof approvalEnvelopeSchema>;

export class RemediationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemediationPolicyError";
  }
}

function canonicalApprovalMessage(envelope: Omit<ApprovalEnvelope, "signature">): Buffer {
  return Buffer.from(JSON.stringify({
    version: envelope.version,
    remediationId: envelope.remediationId,
    payloadSha256: envelope.payloadSha256,
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
    nonce: envelope.nonce,
  }), "utf8");
}

export function parseRemediationContent(content: string): RemediationAction {
  let candidate: unknown;
  try {
    candidate = JSON.parse(content);
  } catch {
    throw new RemediationPolicyError("Remediation payload must be JSON");
  }

  const parsed = remediationActionSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new RemediationPolicyError("Remediation payload is not an allowlisted action");
  }
  return parsed.data;
}

export function serializeRemediationAction(action: RemediationAction): string {
  return JSON.stringify(remediationActionSchema.parse(action));
}

export function remediationPayloadHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function expectedPrismaActionType(action: RemediationAction): "SYSTEM_RESTART" | "SECURITY_BAN" {
  return action.action === "RESTART_WEB" ? "SYSTEM_RESTART" : "SECURITY_BAN";
}

export function verifyOutOfBandApproval(input: {
  envelope: unknown;
  remediationId: string;
  remediationContent: string;
  publicKeyPem: string | undefined;
  now?: Date;
}): ApprovalEnvelope {
  const parsed = approvalEnvelopeSchema.safeParse(input.envelope);
  if (!parsed.success) {
    throw new RemediationPolicyError("Invalid out-of-band approval envelope");
  }

  const envelope = parsed.data;
  const now = input.now ?? new Date();
  const issuedAt = new Date(envelope.issuedAt);
  const expiresAt = new Date(envelope.expiresAt);

  if (envelope.remediationId !== input.remediationId) {
    throw new RemediationPolicyError("Approval is bound to a different remediation");
  }
  if (envelope.payloadSha256 !== remediationPayloadHash(input.remediationContent)) {
    throw new RemediationPolicyError("Approval payload hash does not match");
  }
  if (issuedAt.getTime() > now.getTime() + 30_000) {
    throw new RemediationPolicyError("Approval issue time is in the future");
  }
  if (expiresAt.getTime() <= now.getTime()) {
    throw new RemediationPolicyError("Approval has expired");
  }
  if (expiresAt.getTime() - issuedAt.getTime() > 10 * 60_000) {
    throw new RemediationPolicyError("Approval lifetime exceeds ten minutes");
  }
  if (!input.publicKeyPem?.trim()) {
    throw new RemediationPolicyError("Out-of-band approval public key is not configured");
  }

  let signature: Buffer;
  try {
    signature = Buffer.from(envelope.signature, "base64");
  } catch {
    throw new RemediationPolicyError("Approval signature is not valid base64");
  }

  const { signature: _signature, ...unsignedEnvelope } = envelope;
  try {
    const isValid = verifySignature(
      null,
      canonicalApprovalMessage(unsignedEnvelope),
      createPublicKey(input.publicKeyPem),
      signature,
    );
    if (!isValid) {
      throw new RemediationPolicyError("Approval signature is invalid");
    }
  } catch (error) {
    if (error instanceof RemediationPolicyError) throw error;
    throw new RemediationPolicyError("Approval public key or signature is invalid");
  }

  return envelope;
}
