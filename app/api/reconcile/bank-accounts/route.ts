import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string })?.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.bankAccount.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      bankName: true,
      maskedAccountNumber: true,
      currency: true,
      plaidAccessTokenEncrypted: true,
    },
  });

  const data = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    bankName: a.bankName,
    maskedAccountNumber: a.maskedAccountNumber,
    currency: a.currency,
    plaidLinked: Boolean(a.plaidAccessTokenEncrypted),
  }));

  return NextResponse.json({ data });
}
