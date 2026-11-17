import { NextResponse } from "next/server";
import { requireExpenseAccess } from "@/lib/expenses/access";
import { runDueRecurring } from "@/lib/expenses/automation";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";

/** Posts this workspace's due schedules now (the daily job does the same for everyone). */
export async function POST(request: Request) {
  const limit = await enforceRouteRateLimit({ request, route: "/api/expenses/recurring/run", scope: "expense-recurring-run", max: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const auth = await requireExpenseAccess("expenses.create");
  if (!auth.ok) return auth.response;
  const r = await runDueRecurring(new Date(), auth.ctx.workspaceId);
  return NextResponse.json({ success: true, created: r.created, drafts: r.drafts, failed: r.failed });
}
