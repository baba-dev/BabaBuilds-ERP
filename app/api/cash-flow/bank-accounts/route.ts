import { NextResponse } from "next/server";
import { z } from "zod";
import { cashFlowError, requireCashFlowAccess } from "@/lib/cash-flow/access";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { Prisma } from "@prisma/client";

const accountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  bankName: z.string().trim().max(120).optional().nullable(),
  accountHolderName: z.string().trim().max(120).optional().nullable(),
  maskedAccountNumber: z.string().trim().max(32).optional().nullable(),
  currency: z.string().trim().min(3).max(8).optional().nullable(),
  openingBalance: z.number().finite().min(-1e12).max(1e12).optional().nullable(),
  openingBalanceDate: z.string().min(1).optional().nullable(),
});

/** Cash and bank accounts with today's balance (opening balance plus every movement since). */
export async function GET() {
  const auth = await requireCashFlowAccess("cash_flow.view");
  if (!auth.ok) return auth.response;
  const { workspaceId } = auth.ctx;
  const accounts = await prisma.bankAccount.findMany({
    where: { workspaceId }, orderBy: { createdAt: "asc" },
    select: { id: true, name: true, bankName: true, maskedAccountNumber: true, currency: true, openingBalance: true, openingBalanceDate: true, sourceType: true, lastPlaidSyncAt: true },
  });
  const sums = await Promise.all(accounts.map((a) => prisma.bankTransaction.aggregate({ where: { workspaceId, accountId: a.id, date: { gte: a.openingBalanceDate } }, _sum: { amount: true }, _max: { date: true }, _count: true })));
  return NextResponse.json({
    data: accounts.map((a, i) => ({ ...a, balance: Number(a.openingBalance) + Number(sums[i]?._sum.amount ?? 0), lastTransactionAt: sums[i]?._max.date ?? null, transactionCount: sums[i]?._count ?? 0 })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireCashFlowAccess("cash_flow.manage_assumptions");
  if (!auth.ok) return auth.response;
  const parsed = accountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return cashFlowError(422, "VALIDATION", "Check the account details.", { fields: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? ""), code: i.code })) });
  const { workspaceId, userId, email } = auth.ctx;
  const when = parsed.data.openingBalanceDate ? new Date(parsed.data.openingBalanceDate) : new Date();
  if (Number.isNaN(when.getTime())) return cashFlowError(422, "VALIDATION", "Check the date.", { fields: [{ field: "openingBalanceDate", code: "DATE" }] });
  try {
    const created = await prisma.bankAccount.create({
      data: { workspaceId, name: parsed.data.name, bankName: parsed.data.bankName ?? null, accountHolderName: parsed.data.accountHolderName ?? null, maskedAccountNumber: parsed.data.maskedAccountNumber ?? null, sourceType: "CASH_FLOW", currency: parsed.data.currency || "INR", openingBalance: parsed.data.openingBalance ?? 0, openingBalanceDate: when },
      select: { id: true, name: true },
    });
    void logActivity({ action: "bank_account_created", status: "SUCCESS", workspaceId, actor: { userId, email }, request, entity: { type: "bank_account", id: created.id }, metadata: { openingBalance: parsed.data.openingBalance ?? 0 } });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return cashFlowError(409, "DUPLICATE_NAME", "An account with this name already exists.");
    throw error;
  }
}
