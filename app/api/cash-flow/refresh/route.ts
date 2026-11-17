import { NextResponse } from "next/server";
import { z } from "zod";
import { cashFlowError, requireCashFlowAccess } from "@/lib/cash-flow/access";
import { saveHorizonSnapshots } from "@/lib/cash-flow/persist";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";
import { logActivity } from "@/lib/security/activity-log";

const bodySchema = z.object({ horizonType: z.enum(["DAILY_30", "WEEKLY_13", "MONTHLY_12"]).default("WEEKLY_13") });

/** Save today's forecast (all three scenarios) so it can later be compared with what happened. The live view never needs this; the nightly job does it too. */
export async function POST(request: Request) {
  const auth = await requireCashFlowAccess("cash_flow.view");
  if (!auth.ok) return auth.response;
  const limit = await enforceRouteRateLimit({ request, route: "/api/cash-flow/refresh", scope: "refresh", max: 10, windowMs: 10 * 60_000 });
  if (!limit.ok) return limit.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return cashFlowError(400, "INVALID_BODY", "Unknown horizon.");
  try {
    const { ids } = await saveHorizonSnapshots({ workspaceId: auth.ctx.workspaceId, horizonType: parsed.data.horizonType, generatedBy: "USER" });
    void logActivity({ action: "cash_forecast_saved", status: "SUCCESS", workspaceId: auth.ctx.workspaceId, actor: { userId: auth.ctx.userId, email: auth.ctx.email }, request, metadata: { horizonType: parsed.data.horizonType } });
    return NextResponse.json({ snapshotIds: ids });
  } catch (error) {
    console.error("[CASH_FLOW_REFRESH]", error);
    return cashFlowError(500, "REFRESH_FAILED", "Failed to save the forecast.");
  }
}
