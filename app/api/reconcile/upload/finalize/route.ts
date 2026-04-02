import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const body = await request.json();
    const { approvedInvoices, approvedExpenses } = body;

    if (!Array.isArray(approvedInvoices) || !Array.isArray(approvedExpenses)) {
      return NextResponse.json({ error: "Invalid data format provided." }, { status: 400 });
    }

    // 2. PREPARE EXPENSE DATA
    const newExpenses = approvedExpenses.map((exp: any) => ({
      workspaceId: workspaceId,
      date: new Date(exp.date),
      amount: parseFloat(exp.amount),
      category: exp.aiCategory || "Uncategorized",
      vendor: exp.aiVendor || "Unknown Vendor",
      description: exp.description || "Imported via Bank Reconciliation",
    }));

    // 3. EXECUTE PRISMA TRANSACTION
    // Guarantees that either all records are saved or none are (Atomic operation)
    await prisma.$transaction(async (tx) => {
      
      // A. Bulk Insert New Expenses
      if (newExpenses.length > 0) {
        await tx.expense.createMany({
          data: newExpenses,
        });
      }

      // B. Process Matched Invoices (Revenue Fix)
      if (approvedInvoices.length > 0) {
        // Extract invoice numbers (matchId) from the approved list
        const invoiceNumbers = approvedInvoices.map((inv: any) => inv.matchId);

        // Fetch current invoice records to get their original billed amounts
        const dbInvoices = await tx.invoice.findMany({
          where: {
            workspaceId: workspaceId,
            invoiceNumber: { in: invoiceNumbers }
          }
        });

        // Loop through each matched invoice to apply the payment
        for (const dbInv of dbInvoices) {
          // Find the corresponding bank statement line to get the actual date it hit the bank
          const statementLine = approvedInvoices.find((i: any) => i.matchId === dbInv.invoiceNumber);
          
          await tx.invoice.update({
            where: { id: dbInv.id },
            data: {
              status: 'Paid',
              // CRITICAL FIX: Set amountReceived so Dashboard/Tax math works
              amountReceived: dbInv.totalAmount, 
              // USE STATEMENT DATE: Ensure chronological accuracy for tax audit
              dateReceived: statementLine ? new Date(statementLine.date) : new Date(),
            }
          });
        }
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: `Successfully logged ${newExpenses.length} expenses and reconciled ${approvedInvoices.length} invoices with correct revenue totals.` 
    });

  } catch (error: any) {
    console.error("Reconciliation Finalization Error:", error);
    return NextResponse.json(
      { error: 'Failed to write to ledger. Please check your data and try again.' }, 
      { status: 500 }
    );
  }
}