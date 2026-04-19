import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string })?.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId") || undefined;
  const unreconciledOnly = searchParams.get("unreconciled") === "1";
  const take = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
  const skip = Math.max(0, Number(searchParams.get("offset") || 0));

  const where = {
    workspaceId,
    ...(accountId ? { accountId } : {}),
    ...(unreconciledOnly ? { isReconciled: false } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      orderBy: { date: "desc" },
      take,
      skip,
      include: {
        account: { select: { id: true, name: true } },
      },
    }),
    prisma.bankTransaction.count({ where }),
  ]);

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      description: r.description,
      amount: r.amount.toString(),
      type: r.transactionType,
      isReconciled: r.isReconciled,
      referenceId: r.referenceId,
      accountId: r.accountId,
      accountName: r.account?.name ?? null,
      matchedInvoiceId: r.matchedInvoiceId,
      matchedExpenseId: r.matchedExpenseId,
      category: r.category,
      importBatchId: r.importBatchId,
    })),
    total,
  });
}
