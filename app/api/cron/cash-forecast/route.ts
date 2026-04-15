/**
 * GET /api/cron/cash-forecast
 *
 * Nightly cron to compute cash forecast snapshots for all active workspaces.
 * Authorization: Bearer CRON_SECRET (see `lib/security/cron-auth.ts`)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCronAuthorized, unauthorizedCronResponse } from "@/lib/security/cron-auth";
import { refreshCashForecastSnapshotsForWorkspace } from "@/lib/cash-flow/persist";
import { recomputeClientPaymentBehavior } from "@/lib/cash-flow/payment-behavior";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  try {
    const workspaces = await prisma.workspace.findMany({
      where: { subscriptionStatus: { not: "SUSPENDED" } },
      select: { id: true },
    });

    const logs: Array<{ workspaceId: string; ok: boolean; error?: string }> = [];
    for (const ws of workspaces) {
      try {
        await recomputeClientPaymentBehavior({ workspaceId: ws.id, now: new Date() });
        await refreshCashForecastSnapshotsForWorkspace({ workspaceId: ws.id, now: new Date(), replaceLatest: true });
        logs.push({ workspaceId: ws.id, ok: true });
      } catch (err: unknown) {
        logs.push({ workspaceId: ws.id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return NextResponse.json({
      message: "cash forecast cron complete",
      workspaces: workspaces.length,
      ok: logs.filter((l) => l.ok).length,
      failed: logs.filter((l) => !l.ok).length,
      logs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/cash-forecast]", err);
    return NextResponse.json({ error: "Cron failed", detail: message }, { status: 500 });
  }
}

