import { NextResponse } from "next/server";
import { requireExpenseAccess } from "@/lib/expenses/access";
import { expenseMeta } from "@/lib/expenses/queries";

/** Categories and vendors already used, for the form's suggestions. */
export async function GET() {
  const auth = await requireExpenseAccess("expenses.view");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ data: await expenseMeta(auth.ctx.workspaceId) });
}
