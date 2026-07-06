import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

async function getLoginMethodCount(userId: string) {
  const [user, googleAccounts, passkeys] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } }),
    prisma.account.count({ where: { userId, provider: "google" } }),
    prisma.webAuthnCredential.count({ where: { userId } }),
  ]);
  return Number(Boolean(user?.passwordHash)) + Number(googleAccounts > 0) + passkeys;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "Passkey name is required." }, { status: 400 });

  const result = await prisma.webAuthnCredential.updateMany({ where: { id, userId: session.user.id }, data: { name } });
  if (result.count === 0) return NextResponse.json({ error: "Passkey not found." }, { status: 404 });
  logActivity({ action: "account_security.passkey_renamed", outcome: "success", entityType: "WebAuthnCredential", entityId: id, actorId: session.user.id, actorEmail: session.user.email, metadata: { name } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((await getLoginMethodCount(session.user.id)) <= 1) {
    return NextResponse.json({ error: "Add another sign-in method before deleting your last passkey." }, { status: 400 });
  }
  const { id } = await params;
  const result = await prisma.webAuthnCredential.deleteMany({ where: { id, userId: session.user.id } });
  if (result.count === 0) return NextResponse.json({ error: "Passkey not found." }, { status: 404 });
  logActivity({ action: "account_security.passkey_deleted", outcome: "success", entityType: "WebAuthnCredential", entityId: id, actorId: session.user.id, actorEmail: session.user.email });
  return NextResponse.json({ ok: true });
}
