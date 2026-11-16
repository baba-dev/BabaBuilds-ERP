import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireReconAccess } from "@/lib/reconciliation/access";

export async function GET() {
  const access = await requireReconAccess("reconciliation.import");
  if (!access.ok) return access.response;
  const workspaceId = access.ctx.workspaceId;

  const accounts = await prisma.bankAccount.findMany({
    where: { workspaceId },
    orderBy: [{ isPrimaryRemittance: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      bankName: true,
      maskedAccountNumber: true,
      currency: true,
      isPrimaryRemittance: true,
      plaidAccessTokenEncrypted: true,
    },
  });

  const data = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    bankName: a.bankName,
    maskedAccountNumber: a.maskedAccountNumber,
    currency: a.currency,
    isPrimaryRemittance: a.isPrimaryRemittance,
    plaidLinked: Boolean(a.plaidAccessTokenEncrypted),
  }));

  return NextResponse.json({ data });
}
