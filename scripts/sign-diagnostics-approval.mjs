#!/usr/bin/env node
/** Offline signer. Keep the private key off the ERP/web host. */
import { createHash, randomBytes, sign } from "node:crypto";
import { readFile } from "node:fs/promises";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const remediationId = argument("--remediation-id");
const contentFile = argument("--content-file");
const privateKeyFile = argument("--private-key-file");
const ttlSeconds = Number(argument("--ttl-seconds") || "300");

if (!remediationId || !contentFile || !privateKeyFile || !Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 600) {
  console.error(
    "Usage: sign-diagnostics-approval.mjs --remediation-id ID --content-file FILE --private-key-file FILE [--ttl-seconds 300]",
  );
  process.exit(2);
}

const [content, privateKey] = await Promise.all([
  readFile(contentFile, "utf8"),
  readFile(privateKeyFile, "utf8"),
]);
const issuedAt = new Date();
const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1_000);
const unsignedApproval = {
  version: 1,
  remediationId,
  payloadSha256: createHash("sha256").update(content, "utf8").digest("hex"),
  issuedAt: issuedAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
  nonce: randomBytes(24).toString("hex"),
};
const signature = sign(
  null,
  Buffer.from(JSON.stringify(unsignedApproval), "utf8"),
  privateKey,
).toString("base64");

process.stdout.write(`${JSON.stringify({
  remediationId,
  approval: { ...unsignedApproval, signature },
}, null, 2)}\n`);
