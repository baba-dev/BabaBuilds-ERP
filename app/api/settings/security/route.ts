import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      passwordUpdatedAt: true,
      accounts: { select: { id: true, provider: true, providerAccountId: true } },
      webAuthnCredentials: {
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, credentialID: true, createdAt: true, lastUsedAt: true, deviceType: true, backedUp: true, transports: true },
      },
      sessions: { where: { expires: { gt: new Date() } }, orderBy: { expires: "desc" }, select: { id: true, expires: true } },
    },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const googleAccounts = user.accounts.filter((account) => account.provider === "google");
  const loginMethodCount = Number(Boolean(user.passwordHash)) + Number(googleAccounts.length > 0) + user.webAuthnCredentials.length;

  return NextResponse.json({
    email: user.email,
    password: { configured: Boolean(user.passwordHash), updatedAt: user.passwordUpdatedAt },
    google: { connected: googleAccounts.length > 0, accounts: googleAccounts.map((account) => ({ id: account.id, providerAccountId: account.providerAccountId })) },
    passkeys: user.webAuthnCredentials.map((credential, index) => ({
      id: credential.id,
      name: credential.name || `Passkey ${user.webAuthnCredentials.length - index}`,
      createdAt: credential.createdAt,
      lastUsedAt: credential.lastUsedAt,
      deviceType: credential.deviceType,
      backedUp: credential.backedUp,
      transports: credential.transports,
    })),
    sessions: { strategy: "jwt", activeDatabaseSessions: user.sessions.map((row) => ({ id: row.id, expires: row.expires })) },
    guardrails: { loginMethodCount, canDisconnectGoogle: !googleAccounts.length || loginMethodCount > 1 },
  });
}
