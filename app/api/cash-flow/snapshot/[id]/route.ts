import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type StalenessSignal = {
  key:
    | "invoices"
    | "purchaseOrders"
    | "retainers"
    | "bankTransactions"
    | "manualAdjustments"
    | "assumptions";
  label: string;
  lastUpdatedAt: Date | null;
};

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

  const [
    invoiceStamp,
    poStamp,
    retainerStamp,
    bankTxStamp,
    manualAdjStamp,
    assumptionsStamp,
  ] = await Promise.all([
    prisma.invoice.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.purchaseOrder.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.retainer.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.bankTransaction.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.cashForecastManualAdjustment.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.cashForecastAssumption.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  const signals: StalenessSignal[] = [
    // Invoice doesn't have updatedAt; createdAt is a useful “new invoices since snapshot” signal.
    { key: "invoices", label: "Invoices", lastUpdatedAt: invoiceStamp?.createdAt ?? null },
    { key: "purchaseOrders", label: "Purchase orders", lastUpdatedAt: poStamp?.updatedAt ?? null },
    { key: "retainers", label: "Retainers", lastUpdatedAt: retainerStamp?.updatedAt ?? null },
    // BankTransaction doesn't have updatedAt; createdAt captures new imports since snapshot.
    { key: "bankTransactions", label: "Bank transactions", lastUpdatedAt: bankTxStamp?.createdAt ?? null },
    // Manual adjustments do not currently track updatedAt. createdAt is a good enough signal for “changed since snapshot”.
    { key: "manualAdjustments", label: "Manual adjustments", lastUpdatedAt: manualAdjStamp?.createdAt ?? null },
    { key: "assumptions", label: "Assumptions", lastUpdatedAt: assumptionsStamp?.updatedAt ?? null },
  ];

  const generatedAt = snapshot.generatedAt;
  const changedSinceSnapshot = signals
    .filter((s) => (s.lastUpdatedAt ? s.lastUpdatedAt.getTime() > generatedAt.getTime() : false))
    .map((s) => ({
      key: s.key,
      label: s.label,
      lastUpdatedAt: s.lastUpdatedAt!.toISOString(),
    }));

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
        stalenessSignals: {
          generatedAt: generatedAt.toISOString(),
          stamps: {
            invoices: invoiceStamp?.createdAt?.toISOString?.() ?? null,
            purchaseOrders: poStamp?.updatedAt?.toISOString?.() ?? null,
            retainers: retainerStamp?.updatedAt?.toISOString?.() ?? null,
            bankTransactions: bankTxStamp?.createdAt?.toISOString?.() ?? null,
            manualAdjustments: manualAdjStamp?.createdAt?.toISOString?.() ?? null,
            assumptions: assumptionsStamp?.updatedAt?.toISOString?.() ?? null,
          },
          changedSinceSnapshot,
        },
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

