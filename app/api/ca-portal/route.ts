import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import type { CAExpenseRow, CAInvoiceRow, CAPortalPayload } from "@/lib/ca-portal/types";
import { decimalToNumber, toDecimal } from "@/lib/money";
import { getCurrentFinancialYear } from '@/lib/financial-year';

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

// Helper function to calculate exact UTC boundaries for an Indian Financial Year
function getFinancialYearDates(fyString: string) {
  // fyString format expected: "25-26"
  const parts = fyString.split('-');
  if (parts.length !== 2) throw new Error("Invalid FY format");

  const startYear = 2000 + parseInt(parts[0]);
  const endYear = 2000 + parseInt(parts[1]);

  // April 1st of Start Year (00:00:00)
  const startDate = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0)); 
  
  // March 31st of End Year (23:59:59)
  const endDate = new Date(Date.UTC(endYear, 2, 31, 23, 59, 59, 999)); 

  return { startDate, endDate };
}

export async function GET(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    // 2. PARSE FINANCIAL YEAR
    const { searchParams } = new URL(request.url);
    const fy = searchParams.get('fy') || getCurrentFinancialYear();
    
    let dateFilter;
    try {
      const { startDate, endDate } = getFinancialYearDates(fy);
      dateFilter = { gte: startDate, lte: endDate };
    } catch (e) {
      return NextResponse.json({ error: "Invalid Financial Year parameter", code: "INVALID_FINANCIAL_YEAR" }, { status: 400 });
    }

    // 3. FETCH ALL DATA CONCURRENTLY (Massive performance boost)
    const [invoices, receiptInvoices, expenses, investments, profile] = await Promise.all([
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
      prisma.investment.findMany({
        where: { workspaceId, date: dateFilter }
      }),
      prisma.businessProfile.findUnique({
        where: { workspaceId }
      })
    ]);


    // 4. CALCULATE ITR-4 SUMMARY METRICS
    // Tax basis assumption: summary metrics follow cash/receipt basis (not accrual).
    // Therefore, gross receipts only include collections whose dateReceived falls within the selected FY.
    const grossReceipts = decimalToNumber(
      receiptInvoices.reduce((sum, inv) => {
        if (!isReceiptStatus(inv.status)) return sum;

        // Prefer the explicit collected amount; only use billed totals for legacy PAID rows missing amountReceived.
        const realizedAmount = inv.amountReceived ?? (isPaidStatus(inv.status) ? (inv.grandTotal ?? inv.totalAmount) : null);
        if (realizedAmount === null) return sum;

        return sum.plus(toDecimal(realizedAmount));
      }, toDecimal(0))
    );
    
    // Presumptive income is strictly 50% of gross receipts
    const presumptiveIncome = grossReceipts * 0.5;

    const totalExpenses = decimalToNumber(expenses.reduce((sum, exp) => sum.plus(toDecimal(exp.amount)), toDecimal(0)));

    // Calculate Section 80C & 80D Deductions (Capped at legal limits)
    const raw80C = decimalToNumber(investments.filter(i => i.category.includes('80C')).reduce((sum, i) => sum.plus(toDecimal(i.amount)), toDecimal(0)));
    const deductions80C = Math.min(raw80C, 150000);

    const raw80D = decimalToNumber(investments.filter(i => i.category.includes('80D')).reduce((sum, i) => sum.plus(toDecimal(i.amount)), toDecimal(0)));
    const deductions80D = Math.min(raw80D, 25000); // Using base self-limit for simplicity

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
      sacCode: inv.sacCode || (profile as any)?.defaultSacCode || "998313", // Dynamic Fallback
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

    // 6. RETURN THE PAYLOAD
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
      expenses: formattedExpenses
    };

    return NextResponse.json(payload);

  } catch (error) {
    console.error("CA Portal API Error:", error);
    return NextResponse.json({ error: "Failed to compile audit data", code: "CA_PORTAL_COMPILE_FAILED" }, { status: 500 });
  }
}
