import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { computeAndPersistCashForecastSnapshot } from "@/lib/cash-flow/persist";
import { requireCashFlowModule } from "@/app/api/cash-flow/_module";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = session?.workspaceId as string | undefined;
    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

  const moduleGate = await requireCashFlowModule(workspaceId);
  if (moduleGate) return moduleGate;

    const body = (await request.json().catch(() => ({}))) as {
      horizonType?: "DAILY_30" | "WEEKLY_13" | "MONTHLY_12";
      scenarioTag?: "BASE" | "BEST_CASE" | "WORST_CASE";
      startDate?: string;
    };

    const horizonType = body.horizonType ?? "WEEKLY_13";
    const scenarioTag = body.scenarioTag ?? "BASE";
    const startDate = body.startDate ? new Date(body.startDate) : new Date();

    const result = await computeAndPersistCashForecastSnapshot({
      workspaceId,
      horizonType,
      scenarioTag,
      startDate,
      generatedBy: "USER",
    });

    return NextResponse.json({ snapshotId: result.snapshot.id });
  } catch (error) {
    console.error("[CASH_FLOW_REFRESH]", error);
    return NextResponse.json({ error: "Failed to refresh forecast" }, { status: 500 });
  }
}

