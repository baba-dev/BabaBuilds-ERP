import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import type { CAExpenseRow, CAInvoiceRow, CAPortalPayload } from "@/lib/ca-portal/types";
import { decimalToNumber, toDecimal } from "@/lib/money";

const isPaidStatus = (status: unknown) => String(status).toUpperCase() === "PAID";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    // 2. PARSE FINANCIAL YEAR
    const { searchParams } = new URL(request.url);
    const fy = searchParams.get('fy') || "25-26"; // Default fallback
    
    let dateFilter;
    try {
      const { startDate, endDate } = getFinancialYearDates(fy);
      dateFilter = { gte: startDate, lte: endDate };
    } catch (e) {
      return NextResponse.json({ error: "Invalid Financial Year parameter" }, { status: 400 });
    }

    // 3. FETCH ALL DATA CONCURRENTLY (Massive performance boost)
    const [invoices, expenses, investments, profile] = await Promise.all([
      prisma.invoice.findMany({

        where: { workspaceId, invoiceDate: dateFilter },
        orderBy: { invoiceDate: 'asc' }
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
    // Rule: For 44ADA, only count REALIZED (Paid) income.
    const paidInvoices = invoices.filter(inv => isPaidStatus(inv.status));
    const grossReceipts = decimalToNumber(paidInvoices.reduce((sum, inv) => sum.plus(toDecimal(inv.totalAmount)), toDecimal(0)));
    
    // Presumptive income is strictly 50% of gross receipts
    const presumptiveIncome = grossReceipts * 0.5;

    const totalExpenses = decimalToNumber(expenses.reduce((sum, exp) => sum.plus(toDecimal(exp.amount)), toDecimal(0)));

    // Calculate Section 80C & 80D Deductions (Capped at legal limits)
    const raw80C = decimalToNumber(investments.filter(i => i.category.includes('80C')).reduce((sum, i) => sum.plus(toDecimal(i.amount)), toDecimal(0)));
    const deductions80C = Math.min(raw80C, 150000);

    const raw80D = decimalToNumber(investments.filter(i => i.category.includes('80D')).reduce((sum, i) => sum.plus(toDecimal(i.amount)), toDecimal(0)));
    const deductions80D = Math.min(raw80D, 25000); // Using base self-limit for simplicity

    // 5. DATA FORMATTING FOR THE UI
    // Ensure the data exactly matches the datatable columns in the UI
    const formattedInvoices: CAInvoiceRow[] = invoices.map(inv => ({
      id: inv.id,
      invoiceDate: inv.invoiceDate.toISOString(),
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName,
      sacCode: inv.sacCode || (profile as any)?.defaultSacCode || "998313", // Dynamic Fallback
      totalAmount: decimalToNumber(inv.totalAmount),


      amountReceived: isPaidStatus(inv.status) ? decimalToNumber(inv.totalAmount) : null,
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
        deductions80D
      },
      invoices: formattedInvoices,
      expenses: formattedExpenses
    };

    return NextResponse.json(payload);

  } catch (error) {
    console.error("CA Portal API Error:", error);
    return NextResponse.json({ error: "Failed to compile audit data" }, { status: 500 });
  }
}
