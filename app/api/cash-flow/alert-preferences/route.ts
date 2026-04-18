import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCashFlowModule } from "@/app/api/cash-flow/_module";

const prefsSchema = z
  .object({
    criticalEnabled: z.boolean().optional(),
    warningEnabled: z.boolean().optional(),
    infoEnabled: z.boolean().optional(),
  })
  .strict();

export async function GET() {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!session || !workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const moduleGate = await requireCashFlowModule(workspaceId);
  if (moduleGate) return moduleGate;

  const row = await prisma.cashForecastAlertPreference.findFirst({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(
    {
      data: {
        criticalEnabled: row?.criticalEnabled ?? true,
        warningEnabled: row?.warningEnabled ?? true,
        infoEnabled: row?.infoEnabled ?? true,
        updatedAt: row?.updatedAt?.toISOString?.() ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!session || !workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const moduleGate = await requireCashFlowModule(workspaceId);
  if (moduleGate) return moduleGate;

  const body = await request.json().catch(() => null);
  const parsed = prefsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const current = await prisma.cashForecastAlertPreference.findFirst({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
  });

  const next = {
    criticalEnabled: parsed.data.criticalEnabled ?? current?.criticalEnabled ?? true,
    warningEnabled: parsed.data.warningEnabled ?? current?.warningEnabled ?? true,
    infoEnabled: parsed.data.infoEnabled ?? current?.infoEnabled ?? true,
  };

  const row = await prisma.cashForecastAlertPreference.create({
    data: {
      workspaceId,
      ...next,
    },
  });

  return NextResponse.json({ data: { ...next, updatedAt: row.updatedAt.toISOString() } });
}

