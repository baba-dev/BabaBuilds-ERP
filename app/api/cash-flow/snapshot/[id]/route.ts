import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!session || !workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing snapshot id" }, { status: 400 });

  const snapshot = await prisma.cashForecastSnapshot.findFirst({
    where: { id, workspaceId },
    include: {
      periods: {
        orderBy: { periodStart: "asc" },
        include: {
          lineItems: {
            orderBy: [{ expectedDate: "asc" }, { amount: "desc" }],
          },
        },
      },
    },
  });

  if (!snapshot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lineItems = snapshot.periods.flatMap((p) => p.lineItems.map((l) => ({ ...l, periodId: p.id })));

  return NextResponse.json(
    {
      data: {
        id: snapshot.id,
        generatedAt: snapshot.generatedAt,
        horizonType: snapshot.horizonType,
        scenarioTag: snapshot.scenarioTag,
        startDate: snapshot.startDate,
        endDate: snapshot.endDate,
        openingCash: snapshot.openingCash,
        closingCash: snapshot.closingCash,
        totalProjectedInflows: snapshot.totalProjectedInflows,
        totalProjectedOutflows: snapshot.totalProjectedOutflows,
        confidenceScore: snapshot.confidenceScore,
        assumptionsJson: snapshot.assumptionsJson,
        generatedBy: snapshot.generatedBy,
        periods: snapshot.periods.map((p) => ({
          id: p.id,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          bucketLabel: p.bucketLabel,
          openingCash: p.openingCash,
          actualInflows: p.actualInflows,
          projectedInflows: p.projectedInflows,
          actualOutflows: p.actualOutflows,
          projectedOutflows: p.projectedOutflows,
          closingCash: p.closingCash,
          riskLevel: p.riskLevel,
        })),
        lineItems: lineItems.map((l) => ({
          id: l.id,
          periodId: l.periodId,
          direction: l.direction,
          sourceType: l.sourceType,
          sourceId: l.sourceId,
          amount: l.amount,
          expectedDate: l.expectedDate,
          confidence: l.confidence,
          scenarioTag: l.scenarioTag,
          classification: l.classification,
          title: l.title,
          metadataJson: l.metadataJson,
          explanation: l.explanation,
        })),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

