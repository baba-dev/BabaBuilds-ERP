import { NextResponse } from "next/server";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { listUnbilled } from "@/lib/expenses/billable";

/** Unbilled, approved, billable expenses for one client: what the invoice composer offers to add. */
export async function GET(request: Request) {
  const auth = await requireExpenseAccess("expenses.view");
  if (!auth.ok) return auth.response;
  const clientId = new URL(request.url).searchParams.get("clientId");
  if (!clientId) return expenseError(400, "INVALID_BODY", "Choose a client.");
  return NextResponse.json({ data: await listUnbilled(auth.ctx.workspaceId, clientId) }, { headers: { "Cache-Control": "no-store" } });
}
