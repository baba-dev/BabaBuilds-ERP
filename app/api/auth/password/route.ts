import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { currentPassword?: string; newPassword?: string };
  if (!body.newPassword) return NextResponse.json({ error: "New password is required." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { passwordHash: true, isDemo: true } });
  if (!user || user.isDemo) return NextResponse.json({ error: "Password login is not available for this account." }, { status: 400 });
  if (user.passwordHash) {
    const ok = await verifyPassword(body.currentPassword || "", user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(body.newPassword);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid password." },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash, passwordUpdatedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
