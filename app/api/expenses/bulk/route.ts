import { NextResponse } from "next/server";
import { z } from "zod";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { MAX_CATEGORY_LENGTH } from "@/lib/expenses/categories";
import { deleteExpenses, markPaid, recategorize, reviewExpenses, serviceError } from "@/lib/expenses/service";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";

const body = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["DELETE", "MARK_PAID", "SET_CATEGORY", "APPROVE", "REJECT"]),
  value: z.string().trim().max(MAX_CATEGORY_LENGTH).optional(),
  paidAt: z.string().optional(),
  reason: z.string().trim().max(300).optional(),
});

/** One action on up to 200 expenses. Deleting needs expenses.delete, approving or rejecting needs expenses.approve, the rest expenses.create. */
export async function POST(request: Request) {
  const limit = enforceRouteRateLimit({ request, route: "/api/expenses/bulk", scope: "expense-bulk", max: 60, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return expenseError(400, "INVALID_BODY", "Choose expenses and an action.");
  const { ids, action, value, paidAt, reason } = parsed.data;
  const auth = await requireExpenseAccess(action === "DELETE" ? "expenses.delete" : action === "APPROVE" || action === "REJECT" ? "expenses.approve" : "expenses.create");
  if (!auth.ok) return auth.response;
  try {
    if (action === "DELETE") { const r = await deleteExpenses(auth.ctx, ids); return r.ok ? NextResponse.json({ success: true, deleted: r.deleted }) : serviceError(r); }
    if (action === "MARK_PAID") {
      const when = paidAt ? new Date(paidAt) : new Date();
      if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 86_400_000) return expenseError(400, "INVALID_DATE", "Choose a valid payment date.");
      const r = await markPaid(auth.ctx, ids, when);
      return r.ok ? NextResponse.json({ success: true, updated: r.updated }) : serviceError(r);
    }
    if (action === "APPROVE" || action === "REJECT") {
      const r = await reviewExpenses(auth.ctx, ids, action, reason);
      return r.ok ? NextResponse.json({ success: true, updated: r.updated, skipped: r.skipped }) : serviceError(r);
    }
    if (!value) return expenseError(400, "INVALID_BODY", "Choose a category.");
    const r = await recategorize(auth.ctx, ids, value);
    return r.ok ? NextResponse.json({ success: true, updated: r.updated }) : serviceError(r);
  } catch (error) {
    console.error("Expense bulk action failed:", error);
    return expenseError(500, "EXPENSE_BULK_FAILED", "The action could not be completed");
  }
}
