import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/rbac";
import { logActivity } from "@/lib/security/activity-log";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId as string | undefined;
  const actorUserId = session?.user?.id as string | undefined;
  const actorEmail = session?.user?.email as string | undefined;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actorUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perm = await withPermission(actorUserId, workspaceId, 'workspace.manage_settings');
  if (!perm.granted) return perm.response as any;

  const { id } = await ctx.params;

  const bank = await prisma.bankAccount.findFirst({ where: { id, workspaceId } });
  if (!bank) return NextResponse.json({ error: "Bank account not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.bankAccount.updateMany({
      where: { workspaceId, isPrimaryRemittance: true },
      data: { isPrimaryRemittance: false },
    });

    await tx.bankAccount.update({
      where: { id: bank.id },
      data: { isPrimaryRemittance: true, sourceType: bank.sourceType ?? "CASH_FLOW" },
    });

    await tx.businessProfile.updateMany({
      where: { workspaceId },
      data: {
        primaryBankAccountId: bank.id,
        bankName: bank.bankName || "",
        accountName: bank.accountHolderName || "",
        accountNumber: bank.maskedAccountNumber || "",
        ifscCode: bank.routingCode || "",
      },
    });
  });

  logActivity({
    action: "primary_remittance_account_promoted",
    status: "SUCCESS",
    workspaceId,
    actor: { userId: actorUserId, email: actorEmail },
    entity: { type: "bank_account", id: bank.id },
    metadata: {
      bankName: bank.bankName ?? null,
      sourceType: bank.sourceType ?? "CASH_FLOW",
    },
    request,
  });

  return NextResponse.json({ success: true });
}
