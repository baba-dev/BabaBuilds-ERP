import { NextResponse } from "next/server";
import { requireExpenseAccess } from "@/lib/expenses/access";
import { ageing, openPayables } from "@/lib/expenses/payables-data";

/** Bills waiting to be paid, oldest due first, with ageing buckets. */
export async function GET() {
  const auth = await requireExpenseAccess("expenses.view");
  if (!auth.ok) return auth.response;
  const items = await openPayables(auth.ctx.workspaceId);
  items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  return NextResponse.json({ data: items.slice(0, 200).map((i) => ({ ...i, date: i.date.toISOString(), dueDate: i.dueDate.toISOString() })), ageing: ageing(items), total: items.reduce((s, i) => s + i.amount, 0) }, { headers: { "Cache-Control": "no-store" } });
}
