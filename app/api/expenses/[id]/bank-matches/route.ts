import { NextResponse } from "next/server";
import { z } from "zod";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { bankMatchesForExpense, linkBankTransaction } from "@/lib/expenses/bank-match";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, props: Ctx) {
  const auth = await requireExpenseAccess("expenses.view");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const matches = await bankMatchesForExpense(auth.ctx.workspaceId, id);
  return matches ? NextResponse.json({ data: matches }) : expenseError(404, "EXPENSE_NOT_FOUND", "Expense not found.");
}

/** Matches the expense to a bank debit. A bill on credit is marked paid on the bank date. */
export async function POST(request: Request, props: Ctx) {
  const auth = await requireExpenseAccess("expenses.create");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const parsed = z.object({ bankTransactionId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return expenseError(400, "INVALID_BODY", "Choose a bank line.");
  const r = await linkBankTransaction(auth.ctx, id, parsed.data.bankTransactionId);
  return r.ok ? NextResponse.json({ success: true, markedPaid: r.markedPaid }) : expenseError(r.status, r.code, r.message);
}
