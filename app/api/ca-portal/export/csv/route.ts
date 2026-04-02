import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { format } from 'date-fns';

// Reusing the exact same date math to ensure data matches the UI perfectly
function getFinancialYearDates(fyString: string) {
  const parts = fyString.split('-');
  if (parts.length !== 2) throw new Error("Invalid FY format");

  const startYear = 2000 + parseInt(parts[0]);
  const endYear = 2000 + parseInt(parts[1]);

  const startDate = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0)); 
  const endDate = new Date(Date.UTC(endYear, 2, 31, 23, 59, 59, 999)); 

  return { startDate, endDate };
}

// Helper to prevent CSV layout breaks if a user typed a comma in a description
const escapeCsv = (str: string | null | undefined) => {
  if (!str) return '""';
  
  let cleanStr = String(str).replace(/"/g, '""'); // Escape existing quotes
  
  // --- 🚨 SECURITY PATCH START (CSV Injection Prevention) ---
  // If the string starts with a formula character, prepend a tab to neutralize it
  if (/^[=+\-@\t\r\n]/.test(cleanStr)) {
    cleanStr = `\t${cleanStr}`;
  }
  // --- 🚨 SECURITY PATCH END ---

  return `"${cleanStr}"`; // Wrap in quotes
};

export async function GET(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    // 2. PARSE FY
    const { searchParams } = new URL(request.url);
    const fy = searchParams.get('fy') || "25-26";
    
    let dateFilter;
    try {
      const { startDate, endDate } = getFinancialYearDates(fy);
      dateFilter = { gte: startDate, lte: endDate };
    } catch (e) {
      return new NextResponse("Invalid Financial Year", { status: 400 });
    }

    // 3. FETCH DATA
    const [invoices, expenses, profile] = await Promise.all([
      prisma.invoice.findMany({ where: { workspaceId, invoiceDate: dateFilter } }),
      prisma.expense.findMany({ where: { workspaceId, date: dateFilter } }),
      prisma.businessProfile.findUnique({ where: { workspaceId } })
    ]);


    // 4. TRANSFORM & MERGE INTO A UNIFIED LEDGER
    const ledger: any[] = [];

    // Map Invoices (Income)
    invoices.forEach(inv => {
      ledger.push({
        date: inv.invoiceDate,
        type: "INCOME",
        reference: inv.invoiceNumber,
        party: inv.clientName,
        category: `SAC: ${inv.sacCode || (profile as any)?.defaultSacCode || '998313'}`,
        description: inv.serviceDescription || "Services Rendered",

        amount: inv.totalAmount,
        status: inv.status.toUpperCase() // PAID or PENDING
      });
    });

    // Map Expenses
    expenses.forEach(exp => {
      ledger.push({
        date: exp.date,
        type: "EXPENSE",
        reference: "-",
        party: exp.vendor,
        category: exp.category,
        description: exp.description || "Business Expense",
        amount: exp.amount,
        status: "PAID" // Expenses are inherently paid out
      });
    });

    // 5. SORT CHRONOLOGICALLY
    // CAs need to see the exact flow of money in order of occurrence
    ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 6. BUILD THE CSV STRING
    const headers = ["Date", "Transaction Type", "Reference / Voucher", "Party / Vendor", "Category", "Description", "Amount (INR)", "Status"];
    
    const csvRows = [
      headers.join(','), // Header row
      ...ledger.map(row => [
        escapeCsv(format(new Date(row.date), 'dd-MMM-yyyy')),
        escapeCsv(row.type),
        escapeCsv(row.reference),
        escapeCsv(row.party),
        escapeCsv(row.category),
        escapeCsv(row.description),
        row.amount.toFixed(2), // Keep numbers raw for Excel math
        escapeCsv(row.status)
      ].join(','))
    ];

    const csvContent = csvRows.join('\n');

    // 7. RETURN AS A DOWNLOADABLE FILE
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="BabaBuilds_Ledger_FY${fy}.csv"`,
      },
    });

  } catch (error) {
    console.error("CSV Export Error:", error);
    return new NextResponse("Failed to generate CSV", { status: 500 });
  }
}