import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(240).optional().nullable(),
  scenarioTag: z.enum(["BASE", "BEST_CASE", "WORST_CASE"]).optional().nullable(),
  valueJson: z.unknown(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!session || !workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.cashForecastAssumption.findMany({
    where: { workspaceId, key: { startsWith: "cashForecast.profile." }, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { key: true, valueJson: true, updatedAt: true },
  });

  const data = rows.map((r) => {
    const raw = (r.valueJson ?? {}) as any;
    return {
      key: r.key,
      name: String(raw.name ?? r.key),
      description: (raw.description ?? null) as string | null,
      scenarioTag: (raw.scenarioTag ?? null) as "BASE" | "BEST_CASE" | "WORST_CASE" | null,
      valueJson: raw.valueJson ?? raw,
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!session || !workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });

  const id = Math.random().toString(36).slice(2, 10);
  const key = `cashForecast.profile.${id}`;

  const row = await prisma.cashForecastAssumption.create({
    data: {
      workspaceId,
      key,
      valueJson: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        scenarioTag: parsed.data.scenarioTag ?? null,
        valueJson: parsed.data.valueJson,
      } as any,
      isActive: true,
      updatedBy: session.user?.email ?? session.user?.id ?? null,
    },
  });

  return NextResponse.json(
    { data: { key: row.key, updatedAt: row.updatedAt.toISOString() } },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

