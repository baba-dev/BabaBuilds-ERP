import {
  Prisma,
  TaxReadinessBlockerStatus,
  TaxReadinessSeverity,
  TaxReturnFamily,
  TaxReturnStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeMoney, toDecimal } from "@/lib/money";
import { appendTaxAuditEvent } from "@/lib/tax/audit";

const INDIA_MVP_FAMILY = TaxReturnFamily.INDIA_TDS_QTR;
const INDIA_MVP_FORM_CODE = "FORM_24Q";
const INDIA_MVP_FORM_VERSION = "1.0";

type PrefillFact = {
  fieldKey: string;
  fieldLabel: string;
  value: Prisma.InputJsonValue;
  sourceType: "LEDGER" | "TAX_FACT";
  sourceRef: string;
  confidenceScore: number;
};

type ReadinessRuleEvaluation = {
  checkCode: string;
  passed: boolean;
  title: string;
  details: string;
  severity: TaxReadinessSeverity;
  facts?: Prisma.InputJsonValue;
};

const INDIA_MVP_CHECKS: Array<{
  checkCode: string;
  title: string;
  description: string;
  severity: TaxReadinessSeverity;
}> = [
  {
    checkCode: "WITHHOLDING_LEDGER_COVERAGE",
    title: "Withholding ledger entries captured",
    description: "At least one withholding ledger entry should exist during the tax period.",
    severity: TaxReadinessSeverity.CRITICAL,
  },
  {
    checkCode: "WITHHOLDING_FACTS_PRESENT",
    title: "Withholding summary can be computed",
    description: "Computed withholding amount should be positive for the selected period.",
    severity: TaxReadinessSeverity.WARNING,
  },
  {
    checkCode: "VENDOR_BASELINE_PRESENT",
    title: "Vendor payment baseline exists",
    description: "At least one vendor payment should exist to support withholding declaration context.",
    severity: TaxReadinessSeverity.WARNING,
  },
];

async function ensureIndiaMvpForm(workspaceId: string) {
  return prisma.taxForm.upsert({
    where: {
      workspaceId_formCode_version: {
        workspaceId,
        formCode: INDIA_MVP_FORM_CODE,
        version: INDIA_MVP_FORM_VERSION,
      },
    },
    create: {
      workspaceId,
      countryCode: "IN",
      returnFamily: INDIA_MVP_FAMILY,
      formCode: INDIA_MVP_FORM_CODE,
      version: INDIA_MVP_FORM_VERSION,
      title: "India TDS Quarterly Return (MVP)",
      schemaJson: {
        family: "withholding_summary",
        fields: [
          "withholding.totalLedgerAmount",
          "withholding.totalInvoiceTax",
          "withholding.vendorPaymentCount",
          "withholding.bankDebitTotal",
        ],
      },
      isActive: true,
    },
    update: {
      isActive: true,
      returnFamily: INDIA_MVP_FAMILY,
      countryCode: "IN",
    },
  });
}

async function ensureIndiaMvpChecks(workspaceId: string) {
  return Promise.all(
    INDIA_MVP_CHECKS.map((check) =>
      prisma.taxReadinessCheck.upsert({
        where: {
          workspaceId_returnFamily_checkCode: {
            workspaceId,
            returnFamily: INDIA_MVP_FAMILY,
            checkCode: check.checkCode,
          },
        },
        create: {
          workspaceId,
          countryCode: "IN",
          returnFamily: INDIA_MVP_FAMILY,
          checkCode: check.checkCode,
          title: check.title,
          description: check.description,
          severity: check.severity,
          isActive: true,
        },
        update: {
          title: check.title,
          description: check.description,
          severity: check.severity,
          isActive: true,
        },
      })
    )
  );
}

async function derivePrefillFacts(workspaceId: string, startDate: Date, endDate: Date): Promise<PrefillFact[]> {
  const [ledgerAgg, invoiceAgg, vendorPayments, bankDebits] = await Promise.all([
    prisma.accountingEntry.aggregate({
      where: {
        workspaceId,
        postedAt: { gte: startDate, lte: endDate },
        accountCode: { startsWith: "TDS" },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: {
        workspaceId,
        status: { not: "VOID" },
        invoiceDate: { gte: startDate, lte: endDate },
      },
      _sum: { taxAmount: true, totalAmount: true },
      _count: { _all: true },
    }),
    prisma.expense.count({
      where: {
        workspaceId,
        approvalStatus: "APPROVED",
        date: { gte: startDate, lte: endDate },
      },
    }),
    prisma.bankTransaction.aggregate({
      where: {
        workspaceId,
        date: { gte: startDate, lte: endDate },
        amount: { lt: 0 },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const totalLedgerAmount = toDecimal(ledgerAgg._sum.amount ?? 0).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const totalInvoiceTax = toDecimal(invoiceAgg._sum.taxAmount ?? 0).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const totalInvoiceAmount = toDecimal(invoiceAgg._sum.totalAmount ?? 0).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const totalBankDebit = toDecimal(bankDebits._sum.amount ?? 0)
    .abs()
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return [
    {
      fieldKey: "withholding.totalLedgerAmount",
      fieldLabel: "Total withholding from ledger",
      value: serializeMoney(totalLedgerAmount),
      sourceType: "LEDGER",
      sourceRef: `accountingEntry:TDS:*:${ledgerAgg._count._all}`,
      confidenceScore: ledgerAgg._count._all > 0 ? 0.95 : 0.25,
    },
    {
      fieldKey: "withholding.totalInvoiceTax",
      fieldLabel: "Total invoice tax within period",
      value: serializeMoney(totalInvoiceTax),
      sourceType: "TAX_FACT",
      sourceRef: `invoice:taxAmount:${invoiceAgg._count._all}`,
      confidenceScore: invoiceAgg._count._all > 0 ? 0.85 : 0.2,
    },
    {
      fieldKey: "withholding.totalInvoiceAmount",
      fieldLabel: "Total invoice amount within period",
      value: serializeMoney(totalInvoiceAmount),
      sourceType: "TAX_FACT",
      sourceRef: `invoice:totalAmount:${invoiceAgg._count._all}`,
      confidenceScore: invoiceAgg._count._all > 0 ? 0.85 : 0.2,
    },
    {
      fieldKey: "withholding.vendorPaymentCount",
      fieldLabel: "Vendor payments in period",
      value: vendorPayments,
      sourceType: "TAX_FACT",
      sourceRef: "expense:count",
      confidenceScore: vendorPayments > 0 ? 0.8 : 0.25,
    },
    {
      fieldKey: "withholding.bankDebitTotal",
      fieldLabel: "Total bank debits in period",
      value: serializeMoney(totalBankDebit),
      sourceType: "LEDGER",
      sourceRef: `bankTransaction:debits:${bankDebits._count._all}`,
      confidenceScore: bankDebits._count._all > 0 ? 0.7 : 0.2,
    },
  ];
}

function evaluateReadinessChecks(prefillByKey: Map<string, Prisma.Decimal>): ReadinessRuleEvaluation[] {
  const ledgerAmount = prefillByKey.get("withholding.totalLedgerAmount") ?? new Prisma.Decimal(0);
  const invoiceTax = prefillByKey.get("withholding.totalInvoiceTax") ?? new Prisma.Decimal(0);
  const vendorPayments = prefillByKey.get("withholding.vendorPaymentCount") ?? new Prisma.Decimal(0);

  return [
    {
      checkCode: "WITHHOLDING_LEDGER_COVERAGE",
      passed: ledgerAmount.gt(0),
      title: "Withholding ledger entries captured",
      details: ledgerAmount.gt(0) ? "Ledger withholding exists." : "No TDS-prefixed ledger entries were found.",
      severity: TaxReadinessSeverity.CRITICAL,
      facts: { ledgerAmount: serializeMoney(ledgerAmount) },
    },
    {
      checkCode: "WITHHOLDING_FACTS_PRESENT",
      passed: invoiceTax.gt(0),
      title: "Withholding summary can be computed",
      details: invoiceTax.gt(0) ? "Invoice tax facts are available." : "No invoice tax amount found for the selected period.",
      severity: TaxReadinessSeverity.WARNING,
      facts: { invoiceTax: serializeMoney(invoiceTax) },
    },
    {
      checkCode: "VENDOR_BASELINE_PRESENT",
      passed: vendorPayments.gt(0),
      title: "Vendor payment baseline exists",
      details: vendorPayments.gt(0) ? "Vendor payments were found." : "No vendor payments found in expenses for this period.",
      severity: TaxReadinessSeverity.WARNING,
      facts: { vendorPayments: vendorPayments.toNumber() },
    },
  ];
}

async function upsertBlockerForCheck(params: {
  workspaceId: string;
  taxReturnId: string;
  checkId: string;
  evaluation: ReadinessRuleEvaluation;
}) {
  const { workspaceId, taxReturnId, checkId, evaluation } = params;

  if (evaluation.passed) {
    await prisma.taxReadinessBlocker.updateMany({
      where: {
        workspaceId,
        taxReturnId,
        blockerCode: evaluation.checkCode,
        status: TaxReadinessBlockerStatus.OPEN,
      },
      data: {
        status: TaxReadinessBlockerStatus.RESOLVED,
        resolvedAt: new Date(),
        details: evaluation.details,
        factsJson: evaluation.facts ?? Prisma.JsonNull,
      },
    });

    return;
  }

  await prisma.taxReadinessBlocker.upsert({
    where: {
      taxReturnId_blockerCode: {
        taxReturnId,
        blockerCode: evaluation.checkCode,
      },
    },
    create: {
      workspaceId,
      taxReturnId,
      checkId,
      blockerCode: evaluation.checkCode,
      title: evaluation.title,
      details: evaluation.details,
      severity: evaluation.severity,
      status: TaxReadinessBlockerStatus.OPEN,
      factsJson: evaluation.facts ?? Prisma.JsonNull,
      detectedAt: new Date(),
    },
    update: {
      checkId,
      title: evaluation.title,
      details: evaluation.details,
      severity: evaluation.severity,
      status: TaxReadinessBlockerStatus.OPEN,
      resolvedAt: null,
      factsJson: evaluation.facts ?? Prisma.JsonNull,
      detectedAt: new Date(),
    },
  });
}

async function syncBlockersToTasks(params: {
  workspaceId: string;
  taxReturnId: string;
  openBlockers: Array<{
    blockerCode: string;
    title: string;
    details: string | null;
  }>;
}) {
  const { workspaceId, taxReturnId, openBlockers } = params;
  const markerPrefix = `[TAX_RETURN:${taxReturnId}]`;
  const openCodes = new Set(openBlockers.map((item) => item.blockerCode));

  const existingOpenTasks = await prisma.task.findMany({
    where: {
      workspaceId,
      description: { contains: markerPrefix },
      status: { not: "DONE" },
    },
    select: { id: true, title: true, description: true },
  });

  const markerCodeRegex = /\[TAX_RETURN:[^\]]+\]\[([^\]]+)\]/;
  const existingByCode = new Map<string, (typeof existingOpenTasks)[number]>();
  for (const task of existingOpenTasks) {
    const desc = task.description ?? "";
    const match = desc.match(markerCodeRegex);
    if (!match) continue;
    const code = match[1];
    if (openCodes.has(code)) existingByCode.set(code, task);
  }

  for (const blocker of openBlockers) {
    const marker = `${markerPrefix}[${blocker.blockerCode}]`;
    if (existingByCode.has(blocker.blockerCode)) continue;

    await prisma.task.create({
      data: {
        workspaceId,
        title: `Tax readiness: ${blocker.title}`,
        description: `${marker}\n${blocker.details ?? "Resolve tax readiness blocker to continue filing."}`,
        status: "PENDING",
      },
    });
  }

  const staleTasks = await prisma.task.findMany({
    where: {
      workspaceId,
      description: {
        contains: markerPrefix,
      },
      status: { not: "DONE" },
    },
    select: { id: true, description: true },
  });

  for (const staleTask of staleTasks) {
    const description = staleTask.description ?? "";
    const markerMatch = description.match(markerCodeRegex);
    const codeFromMarker = markerMatch?.[1];
    if (codeFromMarker && openCodes.has(codeFromMarker)) continue;

    await prisma.task.update({
      where: { id: staleTask.id },
      data: { status: "DONE" },
    });
  }
}

export async function runIndiaTaxReturnPrep(input: {
  workspaceId: string;
  taxPeriodId: string;
  correlationId?: string | null;
  actorUserId?: string | null;
}) {
  const { workspaceId, taxPeriodId, correlationId, actorUserId } = input;

  const [period, form, checks] = await Promise.all([
    prisma.taxPeriod.findFirst({ where: { id: taxPeriodId, workspaceId } }),
    ensureIndiaMvpForm(workspaceId),
    ensureIndiaMvpChecks(workspaceId),
  ]);

  if (!period) {
    throw new Error("Tax period not found for workspace.");
  }

  const taxReturn = await prisma.taxReturn.upsert({
    where: {
      workspaceId_taxPeriodId_taxFormId: {
        workspaceId,
        taxPeriodId: period.id,
        taxFormId: form.id,
      },
    },
    create: {
      workspaceId,
      taxPeriodId: period.id,
      taxFormId: form.id,
      status: TaxReturnStatus.DRAFT,
    },
    update: {},
  });

  const prefillFacts = await derivePrefillFacts(workspaceId, period.startDate, period.endDate);

  await Promise.all(
    prefillFacts.map((fact) =>
      prisma.taxReturnFieldValue.upsert({
        where: {
          taxReturnId_fieldKey: {
            taxReturnId: taxReturn.id,
            fieldKey: fact.fieldKey,
          },
        },
        create: {
          workspaceId,
          taxReturnId: taxReturn.id,
          fieldKey: fact.fieldKey,
          fieldLabel: fact.fieldLabel,
          valueJson: fact.value,
          sourceType: fact.sourceType,
          sourceRef: fact.sourceRef,
          confidenceScore: fact.confidenceScore,
          isManual: false,
        },
        update: {
          fieldLabel: fact.fieldLabel,
          valueJson: fact.value,
          sourceType: fact.sourceType,
          sourceRef: fact.sourceRef,
          confidenceScore: fact.confidenceScore,
          isManual: false,
        },
      })
    )
  );

  const prefillLookup = new Map(
    prefillFacts.map((fact) => [fact.fieldKey, toDecimal(fact.value as string | number | null | undefined)]),
  );

  const ruleEvaluations = evaluateReadinessChecks(prefillLookup);

  await Promise.all(
    ruleEvaluations.map(async (evaluation) => {
      const check = checks.find((item) => item.checkCode === evaluation.checkCode);
      if (!check) return;
      await upsertBlockerForCheck({
        workspaceId,
        taxReturnId: taxReturn.id,
        checkId: check.id,
        evaluation,
      });
    })
  );

  const openBlockers = await prisma.taxReadinessBlocker.findMany({
    where: {
      workspaceId,
      taxReturnId: taxReturn.id,
      status: TaxReadinessBlockerStatus.OPEN,
    },
  });

  const readinessScore = Math.max(
    0,
    Math.round(((ruleEvaluations.length - openBlockers.length) / Math.max(1, ruleEvaluations.length)) * 100)
  );

  const status = openBlockers.some((item) => item.severity === TaxReadinessSeverity.CRITICAL)
    ? TaxReturnStatus.BLOCKED
    : openBlockers.length > 0
      ? TaxReturnStatus.NEEDS_REVIEW
      : TaxReturnStatus.READY;

  const updatedReturn = await prisma.taxReturn.update({
    where: { id: taxReturn.id },
    data: {
      prefillCompletedAt: new Date(),
      lastReadinessCheckedAt: new Date(),
      readinessScore,
      status,
    },
  });

  await syncBlockersToTasks({
    workspaceId,
    taxReturnId: updatedReturn.id,
    openBlockers: openBlockers.map((item) => ({
      blockerCode: item.blockerCode,
      title: item.title,
      details: item.details,
    })),
  });

  await appendTaxAuditEvent(prisma, {
    workspaceId,
    eventType: 'READINESS_RUN',
    correlationId: correlationId ?? undefined,
    actorUserId: actorUserId ?? undefined,
    entityType: 'TaxReturn',
    entityId: updatedReturn.id,
    payload: {
      taxPeriodId,
      status: updatedReturn.status,
      readinessScore: updatedReturn.readinessScore,
      openBlockersCount: openBlockers.length,
    },
  });

  return {
    taxReturnId: updatedReturn.id,
    taxPeriodId: period.id,
    status: updatedReturn.status,
    readinessScore: updatedReturn.readinessScore,
    openBlockers: openBlockers.map((item) => ({
      blockerCode: item.blockerCode,
      title: item.title,
      details: item.details,
      severity: item.severity,
      detectedAt: item.detectedAt,
    })),
    prefilledFields: prefillFacts.length,
    returnFamily: INDIA_MVP_FAMILY,
  };
}

export async function getTaxReadinessSummary(
  workspaceId: string,
  options: { includeSummary?: boolean } = {},
) {
  const { includeSummary = true } = options;
  if (!includeSummary) {
    return {
      hasReturns: false,
      totalOpenBlockers: 0,
      openBlockersBySeverity: {
        INFO: 0,
        WARNING: 0,
        CRITICAL: 0,
      } as Record<TaxReadinessSeverity, number>,
      nextReturn: null,
      recentReturns: [],
    };
  }

  const [latestReturns, openBlockersBySeverity, openBlockersCount] = await Promise.all([
    prisma.taxReturn.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: "desc" }],
      take: 5,
      include: {
        taxPeriod: {
          select: {
            periodCode: true,
            dueDate: true,
            startDate: true,
            endDate: true,
          },
        },
        taxForm: {
          select: {
            returnFamily: true,
            formCode: true,
          },
        },
      },
    }),
    prisma.taxReadinessBlocker.groupBy({
      by: ["severity"],
      where: {
        workspaceId,
        status: TaxReadinessBlockerStatus.OPEN,
      },
      _count: { _all: true },
    }),
    prisma.taxReadinessBlocker.count({ where: { workspaceId, status: TaxReadinessBlockerStatus.OPEN } }),
  ]);

  const severityCounts = {
    INFO: 0,
    WARNING: 0,
    CRITICAL: 0,
  } as Record<TaxReadinessSeverity, number>;

  for (const row of openBlockersBySeverity) {
    severityCounts[row.severity] = row._count._all;
  }

  const topReturn = latestReturns[0] ?? null;

  return {
    hasReturns: latestReturns.length > 0,
    totalOpenBlockers: openBlockersCount,
    openBlockersBySeverity: severityCounts,
    nextReturn: topReturn
      ? {
          id: topReturn.id,
          status: topReturn.status,
          readinessScore: topReturn.readinessScore,
          formCode: topReturn.taxForm.formCode,
          returnFamily: topReturn.taxForm.returnFamily,
          periodCode: topReturn.taxPeriod.periodCode,
          periodStart: topReturn.taxPeriod.startDate,
          periodEnd: topReturn.taxPeriod.endDate,
          dueDate: topReturn.taxPeriod.dueDate,
        }
      : null,
    recentReturns: latestReturns.map((item) => ({
      id: item.id,
      status: item.status,
      readinessScore: item.readinessScore,
      formCode: item.taxForm.formCode,
      returnFamily: item.taxForm.returnFamily,
      periodCode: item.taxPeriod.periodCode,
      dueDate: item.taxPeriod.dueDate,
    })),
  };
}
