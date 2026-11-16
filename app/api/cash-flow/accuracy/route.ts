import { NextResponse } from "next/server";
import { cashFlowError, requireCashFlowAccess } from "@/lib/cash-flow/access";
import { forecastAccuracy } from "@/lib/cash-flow/accuracy";

/** How close an older forecast came to what the bank actually did. */
export async function GET() {
  const auth = await requireCashFlowAccess("cash_flow.view");
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ data: await forecastAccuracy(auth.ctx.workspaceId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[CASH_FLOW_ACCURACY]", error);
    return cashFlowError(500, "ACCURACY_FAILED", "Could not compare the forecast with actuals.");
  }
}
