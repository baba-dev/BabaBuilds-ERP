import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCashFlowModule } from "@/app/api/cash-flow/_module";
import { z } from "zod";
import { CashForecastDirection } from "@prisma/client";

const createSchema = z.object({
  date: z.string().datetime().or(z.string().min(1)),
  amount: z.number().finite().nonnegative(),
  direction: z.nativeEnum(CashForecastDirection),
  reason: z.string().min(2),
  category: z.string().min(1).optional().nullable(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const moduleGate = await requireCashFlowModule(workspaceId);
  if (moduleGate) return moduleGate;

  const rows = await prisma.cashForecastManualAdjustment.findMany({
    where: { workspaceId },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const moduleGate = await requireCashFlowModule(workspaceId);
  if (moduleGate) return moduleGate;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const created = await prisma.cashForecastManualAdjustment.create({
    data: {
      workspaceId,
      date: new Date(parsed.data.date),
      amount: parsed.data.amount,
      direction: parsed.data.direction,
      reason: parsed.data.reason,
      category: parsed.data.category ?? null,
      createdBy: session?.user?.email ?? null,
    },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}

