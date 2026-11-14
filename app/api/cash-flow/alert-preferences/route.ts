import { NextResponse } from "next/server";
import { z } from "zod";
import { cashFlowError, requireCashFlowAccess } from "@/lib/cash-flow/access";
import { prisma } from "@/lib/prisma";

const prefsSchema = z.object({ criticalEnabled: z.boolean().optional(), warningEnabled: z.boolean().optional(), infoEnabled: z.boolean().optional() }).strict();

const shape = (row: { criticalEnabled: boolean; warningEnabled: boolean; infoEnabled: boolean; updatedAt: Date; lastAlertAt: Date | null } | null) => ({
  criticalEnabled: row?.criticalEnabled ?? true, warningEnabled: row?.warningEnabled ?? true, infoEnabled: row?.infoEnabled ?? true,
  updatedAt: row?.updatedAt.toISOString() ?? null, lastAlertAt: row?.lastAlertAt?.toISOString() ?? null,
});

/** Which shortfall warnings the nightly job may send. */
export async function GET() {
  const auth = await requireCashFlowAccess("cash_flow.view");
  if (!auth.ok) return auth.response;
  const row = await prisma.cashForecastAlertPreference.findUnique({ where: { workspaceId: auth.ctx.workspaceId } });
  return NextResponse.json({ data: shape(row) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireCashFlowAccess("cash_flow.manage_assumptions");
  if (!auth.ok) return auth.response;
  const parsed = prefsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return cashFlowError(400, "INVALID_BODY", "Invalid payload");
  const { workspaceId } = auth.ctx;
  const row = await prisma.cashForecastAlertPreference.upsert({ where: { workspaceId }, update: parsed.data, create: { workspaceId, ...parsed.data } });
  return NextResponse.json({ data: shape(row) });
}
