import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPasswordResetToken, normalizeLoginEmail } from "@/lib/auth/password";
import { checkPasswordAuthRateLimit, hashRateLimitValue, recordPasswordAuthFailure } from "@/lib/auth/rate-limit";
import { recordAuthFailure, recordPasswordAuthAuditEvent } from "@/lib/auth-observability";
import { sendPasswordResetEmail } from "@/lib/auth/password-reset-email";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function getIp(req: Request) {
  return (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = normalizeLoginEmail(body.email || "");
  const ip = getIp(req);
  const key = `password-reset:${hashRateLimitValue(email || "missing")}:${hashRateLimitValue(ip)}`;
  const limited = checkPasswordAuthRateLimit(key);
  if (!limited.ok) {
    recordAuthFailure({ reason: "PASSWORD_RESET_RATE_LIMITED", code: "PASSWORD_RESET_RATE_LIMITED", provider: "password-login" });
    return NextResponse.json({ ok: true, retryAfter: limited.retryAfterSeconds });
  }

  if (!email) return NextResponse.json({ ok: true });

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, isDemo: true } });
  if (!user || user.isDemo) {
    recordPasswordAuthFailure(key);
    recordPasswordAuthAuditEvent({ email, outcome: "reset_requested", ip });
    return NextResponse.json({ ok: true });
  }

  const { token, tokenHash } = createPasswordResetToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      requestedIp: ip,
    },
  });

  try {
    await sendPasswordResetEmail({ email, token });
  } catch (error) {
    // Keep the public response generic to avoid account enumeration. In non-production,
    // surface the link in logs so local development still works without SMTP.
    console.error("[password-reset] email delivery failed", error);
    if (process.env.NODE_ENV !== "production") {
      console.info(`[password-reset] ${email}: /login?resetToken=${token}`);
    }
  }

  recordPasswordAuthAuditEvent({ email, userId: user.id, outcome: "reset_requested", ip });

  return NextResponse.json({ ok: true });
}
