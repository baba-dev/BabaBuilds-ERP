import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import type { CAExpenseRow, CAInvoiceRow, CAPortalPayload } from "@/lib/ca-portal/types";
import { decimalToNumber, toDecimal } from "@/lib/money";
import { getCurrentFinancialYear } from '@/lib/financial-year';
import { reconcileWithholdingForPeriod } from '@/lib/tax/withholding';
import { checkPermission } from '@/lib/rbac';

const isPaidStatus = (status: unknown) => String(status).toUpperCase() === "PAID";
const isReceiptStatus = (status: unknown) => {
  const normalizedStatus = String(status).toUpperCase();
  return normalizedStatus === "PAID" || normalizedStatus === "PARTIALLY_PAID";
};
const DAY_MS = 24 * 60 * 60 * 1000;
const TDS_PERIOD_DUE_DAYS = 14;

const toQuarterEnd = (date: Date) => {
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  if (month <= 2) return new Date(Date.UTC(year, 2, 31, 23, 59, 59, 999));
  if (month <= 5) return new Date(Date.UTC(year, 5, 30, 23, 59, 59, 999));
  if (month <= 8) return new Date(Date.UTC(year, 8, 30, 23, 59, 59, 999));
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
};

function getFinancialYearDates(fyString: string) {
  const parts = fyString.split('-');
  if (parts.length !== 2) throw new Error("Invalid FY format");

  const startYear = 2000 + parseInt(parts[0]);
  const endYear = 2000 + parseInt(parts[1]);

  const startDate = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(endYear, 2, 31, 23, 59, 59, 999));

  return { startDate, endDate };
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
    const userId = (session as { user?: { id?: string | null } }).user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });
    }

    const canViewTax = await checkPermission(userId, workspaceId, 'tax.view');
    if (!canViewTax) {
      return NextResponse.json({ error: "Forbidden", code: "RBAC_PERMISSION_DENIED" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const fy = searchParams.get('fy') || getCurrentFinancialYear();

    let dateFilter;
    try {
      const { startDate, endDate } = getFinancialYearDates(fy);
      dateFilter = { gte: startDate, lte: endDate };
    } catch {
      return NextResponse.json({ error: "Invalid Financial Year parameter", code: "INVALID_FINANCIAL_YEAR" }, { status: 400 });
    }

    const [invoices, receiptInvoices, expenses, investments, profile, withholdingEvents, taxCreditEvents, returnPeriods] = await Promise.all([
      prisma.invoice.findMany({
        where: { workspaceId, invoiceDate: dateFilter },
        orderBy: { invoiceDate: 'asc' }
      }),
      prisma.invoice.findMany({
        where: {
          workspaceId,
          dateReceived: dateFilter,
          status: { in: ['PAID', 'PARTIALLY_PAID'] }
        }
      }),
      prisma.expense.findMany({
        where: { workspaceId, date: dateFilter },
        orderBy: { date: 'asc' }
      }),
      prisma.investment.findMany({ where: { workspaceId, date: dateFilter } }),
      prisma.businessProfile.findUnique({ where: { workspaceId } }),
      prisma.withholdingEvent.findMany({
        where: { workspaceId, deductedAt: dateFilter },
        select: { returnPeriodKey: true, withheldAmount: true, deductedAt: true, depositDueAt: true, depositedAt: true },
      }),
      prisma.taxCreditEvent.findMany({
        where: {
          workspaceId,
          OR: [
            { certificateIssuedAt: dateFilter },
            { createdAt: dateFilter },
          ],
        },
        select: { returnPeriodKey: true, creditedAmount: true, certificateIssuedAt: true, createdAt: true },
      }),
      prisma.taxReturnPeriod.findMany({
        where: {
          workspaceId,
          OR: [
            { periodStart: dateFilter },
            { periodEnd: dateFilter },
            { dueDate: dateFilter },
          ],
        },
        orderBy: { periodStart: 'asc' },
      }),
    ]);

    const grossReceipts = decimalToNumber(
      receiptInvoices.reduce((sum, inv) => {
        if (!isReceiptStatus(inv.status)) return sum;
        const realizedAmount = inv.amountReceived ?? (isPaidStatus(inv.status) ? (inv.grandTotal ?? inv.totalAmount) : null);
        if (realizedAmount === null) return sum;
        return sum.plus(toDecimal(realizedAmount));
      }, toDecimal(0))
    );

    const presumptiveIncome = grossReceipts * 0.5;
    const totalExpenses = decimalToNumber(expenses.reduce((sum, exp) => sum.plus(toDecimal(exp.amount)), toDecimal(0)));

    const raw80C = decimalToNumber(investments.filter(i => i.category.includes('80C')).reduce((sum, i) => sum.plus(toDecimal(i.amount)), toDecimal(0)));
    const deductions80C = Math.min(raw80C, 150000);

    const raw80D = decimalToNumber(investments.filter(i => i.category.includes('80D')).reduce((sum, i) => sum.plus(toDecimal(i.amount)), toDecimal(0)));
    const deductions80D = Math.min(raw80D, 25000);

    const now = new Date();
    const dueSoonThreshold = new Date(now.getTime() + TDS_PERIOD_DUE_DAYS * DAY_MS);
    const pendingStatuses = new Set(['PENDING', 'SENT', 'PARTIALLY_PAID', 'OVERDUE']);

    const dueSoonSet = new Set<string>();
    const lateWithholdingSet = new Set<string>();
    let readinessPassCount = 0;
    let readinessTotalCount = 0;
    let unresolvedBlockers = 0;

    for (const inv of invoices) {
      const normalizedStatus = String(inv.status ?? '').toUpperCase();
      const dueDate = inv.dueDate ?? null;
      if (dueDate && pendingStatuses.has(normalizedStatus)) {
        if (dueDate >= now && dueDate <= dueSoonThreshold) {
          dueSoonSet.add(toQuarterEnd(dueDate).toISOString());
        }
        if (inv.taxAmount && toDecimal(inv.taxAmount).gt(0) && dueDate < now) {
          lateWithholdingSet.add(toQuarterEnd(dueDate).toISOString());
        }
      }

      const invoiceReady = Boolean(inv.sacCode && inv.sacCode.trim() && inv.pdfPath && inv.taxMode);
      readinessTotalCount += 1;
      if (invoiceReady) readinessPassCount += 1;
      else unresolvedBlockers += 1;

      if (normalizedStatus === 'OVERDUE') unresolvedBlockers += 1;
    }

    for (const exp of expenses) {
      const expenseReady = Boolean(exp.receiptUrl && exp.vendor && exp.category && toDecimal(exp.amount).gt(0));
      readinessTotalCount += 1;
      if (expenseReady) readinessPassCount += 1;
      else unresolvedBlockers += 1;
    }

    const readinessPassRate = readinessTotalCount > 0
      ? Number(((readinessPassCount / readinessTotalCount) * 100).toFixed(2))
      : 100;

    // 5. DATA FORMATTING FOR THE UI
    // Ensure the data exactly matches the datatable columns in the UI
    const formattedInvoices: CAInvoiceRow[] = invoices.map(inv => ({
      id: inv.id,
      invoiceDate: inv.invoiceDate.toISOString(),
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName,
      sacCode: inv.sacCode || (profile as any)?.defaultSacCode || "998313",
      totalAmount: decimalToNumber(inv.totalAmount),
      amountReceived: inv.amountReceived === null ? null : decimalToNumber(inv.amountReceived),
      status: inv.status,
      pdfPath: inv.pdfPath
    }));

    const formattedExpenses: CAExpenseRow[] = expenses.map(exp => ({
      id: exp.id,
      date: exp.date.toISOString(),
      category: exp.category,
      vendor: exp.vendor,
      description: exp.description,
      amount: decimalToNumber(exp.amount),
      receiptUrl: exp.receiptUrl
    }));

    const withheldByPeriod = new Map<string, ReturnType<typeof toDecimal>>();
    const creditedByPeriod = new Map<string, ReturnType<typeof toDecimal>>();

    const fallbackPeriodKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

    for (const event of withholdingEvents) {
      const key = event.returnPeriodKey || fallbackPeriodKey(event.deductedAt);
      withheldByPeriod.set(key, (withheldByPeriod.get(key) ?? toDecimal(0)).plus(toDecimal(event.withheldAmount)));
    }

    for (const credit of taxCreditEvents) {
      const sourceDate = credit.certificateIssuedAt ?? credit.createdAt;
      const key = credit.returnPeriodKey || fallbackPeriodKey(sourceDate);
      creditedByPeriod.set(key, (creditedByPeriod.get(key) ?? toDecimal(0)).plus(toDecimal(credit.creditedAmount)));
    }

    const keys = new Set<string>([
      ...Array.from(withheldByPeriod.keys()),
      ...Array.from(creditedByPeriod.keys()),
      ...returnPeriods.map((period) => period.periodKey),
    ]);

    const returnPeriodByKey = new Map(returnPeriods.map((period) => [period.periodKey, period]));

    const warnings: CAPortalPayload['readiness']['warnings'] = [];
    const blockers: CAPortalPayload['readiness']['blockers'] = [];

    const withholdingReconciliation = Array.from(keys)
      .sort((a, b) => a.localeCompare(b))
      .map((periodKey) => {
        const period = returnPeriodByKey.get(periodKey);
        const withheldAmount = (withheldByPeriod.get(periodKey) ?? toDecimal(0)).toDecimalPlaces(2);
        const creditedAmount = (creditedByPeriod.get(periodKey) ?? toDecimal(0)).toDecimalPlaces(2);
        const deltaAmount = withheldAmount.minus(creditedAmount).toDecimalPlaces(2);

        const dueDate = period?.dueDate ?? new Date(now);
        const periodIssues = reconcileWithholdingForPeriod({
          periodKey,
          dueDate,
          filedAt: period?.filedAt ?? null,
          withheldAmount,
          creditedAmount,
        }, now);

        for (const issue of periodIssues) {
          if (issue.severity === 'blocker') {
            blockers.push(issue);
          } else {
            warnings.push(issue);
          }
        }

        return {
          periodKey,
          dueDate: dueDate.toISOString(),
          filedAt: period?.filedAt ? period.filedAt.toISOString() : null,
          withheldAmount: decimalToNumber(withheldAmount),
          creditedAmount: decimalToNumber(creditedAmount),
          deltaAmount: decimalToNumber(deltaAmount),
        };
      });

    const payload: CAPortalPayload = {
      summary: {
        grossReceipts,
        presumptiveIncome,
        totalExpenses,
        deductions80C,
        deductions80D,
        periodsDueSoon: dueSoonSet.size,
        readinessPassRate,
        unresolvedBlockers,
        lateWithholdingDeposits: lateWithholdingSet.size,
      },
      invoices: formattedInvoices,
      expenses: formattedExpenses,
      withholdingReconciliation,
      readiness: {
        warnings,
        blockers,
      },
    };

    return NextResponse.json(payload);

  } catch (error) {
    console.error("CA Portal API Error:", error);
    return NextResponse.json({ error: "Failed to compile audit data", code: "CA_PORTAL_COMPILE_FAILED" }, { status: 500 });
  }
}
