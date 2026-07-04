import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, hashPasswordResetToken } from "@/lib/auth/password";
import { recordPasswordAuthAuditEvent } from "@/lib/auth-observability";

function getIp(req: Request) {
  return (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!body.token || !body.password) {
    return NextResponse.json({ error: "Reset token and password are required." }, { status: 400 });
  }

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(body.password);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid password." }, { status: 400 });
  }

  const tokenHash = hashPasswordResetToken(body.token);
  const reset = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, isDemo: true } } },
  });

  if (!reset || reset.usedAt || reset.expiresAt <= new Date() || reset.user.isDemo) {
    return NextResponse.json({ error: "Reset token is invalid or expired." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash, passwordUpdatedAt: new Date(), passwordFailedAttempts: 0, passwordLockedUntil: null, passwordLastFailureAt: null },
    }),
    prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.updateMany({ where: { userId: reset.userId, usedAt: null, id: { not: reset.id } }, data: { usedAt: new Date() } }),
  ]);

  recordPasswordAuthAuditEvent({ email: reset.user.email || "unknown", userId: reset.userId, outcome: "reset_completed", ip: getIp(req) });
  return NextResponse.json({ ok: true });
}
