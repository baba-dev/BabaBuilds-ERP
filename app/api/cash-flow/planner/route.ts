import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const listSchema = z.object({
  scenarioTag: z.enum(["BASE", "BEST_CASE", "WORST_CASE"]).optional(),
  horizonType: z.enum(["DAILY_30", "WEEKLY_13", "MONTHLY_12"]).optional(),
});

const upsertSchema = z.object({
  planKey: z.string().min(1).max(240),
  scenarioTag: z.enum(["BASE", "BEST_CASE", "WORST_CASE"]),
  horizonType: z.enum(["DAILY_30", "WEEKLY_13", "MONTHLY_12"]),
  status: z.enum(["open", "deferred", "resolved"]),
  note: z.string().max(600).optional().nullable(),
});

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!session || !workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const parsed = listSchema.safeParse({
    scenarioTag: url.searchParams.get("scenarioTag") ?? undefined,
    horizonType: url.searchParams.get("horizonType") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }

  const rows = await prisma.cashForecastLineItemPlan.findMany({
    where: {
      workspaceId,
      ...(parsed.data.scenarioTag ? { scenarioTag: parsed.data.scenarioTag } : {}),
      ...(parsed.data.horizonType ? { horizonType: parsed.data.horizonType } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!session || !workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const row = await prisma.cashForecastLineItemPlan.upsert({
    where: {
      workspaceId_horizonType_scenarioTag_planKey: {
        workspaceId,
        horizonType: input.horizonType,
        scenarioTag: input.scenarioTag,
        planKey: input.planKey,
      }
    },
    update: {
      status: input.status,
      note: input.note ?? null,
    },
    create: {
      workspaceId,
      planKey: input.planKey,
      scenarioTag: input.scenarioTag,
      horizonType: input.horizonType,
      status: input.status,
      note: input.note ?? null,
    },
  });

  return NextResponse.json({ data: row }, { headers: { "Cache-Control": "no-store" } });
}

