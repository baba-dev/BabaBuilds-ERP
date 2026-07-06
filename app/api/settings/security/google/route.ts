import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [user, googleAccounts, passkeys] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { passwordHash: true } }),
    prisma.account.findMany({ where: { userId: session.user.id, provider: "google" }, select: { id: true } }),
    prisma.webAuthnCredential.count({ where: { userId: session.user.id } }),
  ]);
  if (googleAccounts.length === 0) return NextResponse.json({ ok: true });
  const loginMethodCount = Number(Boolean(user?.passwordHash)) + 1 + passkeys;
  if (loginMethodCount <= 1) {
    return NextResponse.json({ error: "Add a password or passkey before disconnecting Google." }, { status: 400 });
  }
  await prisma.account.deleteMany({ where: { userId: session.user.id, provider: "google" } });
  logActivity({ action: "account_security.google_disconnected", outcome: "success", entityType: "Account", actorId: session.user.id, actorEmail: session.user.email, metadata: { disconnectedAccounts: googleAccounts.length } });
  return NextResponse.json({ ok: true });
}
