import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const upsertSchema = z.object({
  key: z.string().min(1).max(128),
  valueJson: z.unknown(),
  effectiveFrom: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId;
  if (!session || !workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.cashForecastAssumption.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId;
  if (!session || !workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const data = parsed.data;
  const row = await prisma.cashForecastAssumption.create({
    data: {
      workspaceId,
      key: data.key,
      valueJson: data.valueJson as any,
      effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null,
      isActive: data.isActive ?? true,
      updatedBy: session.user?.email ?? session.user?.id ?? null,
    },
  });

  return NextResponse.json({ data: row });
}

