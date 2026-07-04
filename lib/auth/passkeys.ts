import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const LOGIN_TOKEN_TTL_MS = 60 * 1000;

export const rpName = process.env.WEBAUTHN_RP_NAME || "BabaBuilds ERP";

export function getRpID() {
  return process.env.WEBAUTHN_RP_ID || new URL(process.env.NEXTAUTH_URL || "http://localhost:3000").hostname;
}

export function getOrigin() {
  return process.env.WEBAUTHN_ORIGIN || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

export function getIp(request: Request) {
  return (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown")
    .split(",")[0]
    .trim();
}

export function toBase64URL(value: Uint8Array | ArrayBuffer | string) {
  const buffer = typeof value === "string" ? Buffer.from(value) : Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
  return buffer.toString("base64url");
}

export function fromBase64URL(value: string) {
  return Buffer.from(value, "base64url");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function readClientChallenge(response: unknown) {
  const clientDataJSON = (response as { response?: { clientDataJSON?: unknown } } | null)?.response?.clientDataJSON;
  if (typeof clientDataJSON !== "string") return null;

  try {
    const parsed = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8")) as { challenge?: unknown };
    return typeof parsed.challenge === "string" && parsed.challenge.length > 0 ? parsed.challenge : null;
  } catch {
    return null;
  }
}

export function normalizeTransports(transports: unknown) {
  if (!Array.isArray(transports)) return null;
  const normalized = transports.filter((transport): transport is string => typeof transport === "string" && transport.length > 0);
  return normalized.length > 0 ? normalized.join(",") : null;
}

export async function storeChallenge(input: { challenge: string; type: "registration" | "authentication"; userId?: string | null }) {
  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.webAuthnChallenge.create({
    data: {
      challenge: input.challenge,
      type: input.type,
      userId: input.userId,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
}

export async function consumeChallenge(challenge: string, type: "registration" | "authentication", userId?: string | null) {
  const row = await prisma.webAuthnChallenge.findFirst({
    where: {
      challenge,
      type,
      usedAt: null,
      expiresAt: { gt: new Date() },
      ...(userId ? { userId } : {}),
    },
  });
  if (!row) return null;
  await prisma.webAuthnChallenge.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row;
}

export async function issueLoginToken(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.webAuthnChallenge.create({
    data: {
      type: "login-token",
      userId,
      challenge: crypto.randomUUID(),
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS),
    },
  });
  return token;
}

export async function consumeLoginToken(token: string) {
  const row = await prisma.webAuthnChallenge.findFirst({
    where: {
      type: "login-token",
      tokenHash: hashToken(token),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });
  if (!row?.user) return null;
  await prisma.webAuthnChallenge.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row.user;
}
