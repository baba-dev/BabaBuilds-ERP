import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

/**
 * POST /api/reconcile/commit
 *
 * Finalizes the reconciliation wizard by atomically:
 *   1. Bulk-inserting all AI-approved bank lines as Expense records
 *   2. Marking all auto-matched invoices as "Paid" with the correct bank deposit date
 *
 * Body shape (sent by app/reconciliation/page.tsx → executeFinalize):
 * {
 *   approvedInvoices: Transaction[]   // items where matchType === 'INVOICE'
 *   approvedExpenses: Transaction[]   // items with an aiCategory (debit lines)
 * }
 *
 * Each Transaction has fields: id, date, description, amount, type,
 * aiCategory?, aiVendor?, matchType?, matchId?
 */
export async function POST(request: Request) {
  try {
    // ── 1. SECURITY LOCK ──────────────────────────────────────────────────────
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    // ── 2. PARSE & VALIDATE ───────────────────────────────────────────────────
    const body = await request.json();
    const { approvedInvoices, approvedExpenses } = body;

    if (!Array.isArray(approvedInvoices) || !Array.isArray(approvedExpenses)) {
      return NextResponse.json(
        { error: "Invalid payload: approvedInvoices and approvedExpenses must be arrays." },
        { status: 400 }
      );
    }

    if (approvedInvoices.length === 0 && approvedExpenses.length === 0) {
      return NextResponse.json(
        { error: "Nothing to commit. Approve at least one transaction first." },
        { status: 400 }
      );
    }

    // ── 3. PREPARE EXPENSE ROWS ───────────────────────────────────────────────
    const newExpenses = approvedExpenses.map((exp: any) => ({
      workspaceId,
      date:        new Date(exp.date),
      amount:      Math.abs(parseFloat(exp.amount)),        // Always positive
      category:    exp.aiCategory  || "Uncategorized",
      vendor:      exp.aiVendor    || "Unknown Vendor",
      description: exp.description || "Imported via Bank Reconciliation",
    }));

    // ── 4. ATOMIC PRISMA TRANSACTION ──────────────────────────────────────────
    // Either everything is written or nothing is (rollback on any failure).
    const result = await prisma.$transaction(async (tx) => {
      let expensesCreated = 0;
      let invoicesReconciled = 0;

      // A. Bulk-insert approved AI-categorized debit lines as Expenses
      if (newExpenses.length > 0) {
        const created = await tx.expense.createMany({
          data: newExpenses,
        });
        expensesCreated = created.count;
      }

      // B. Mark auto-matched invoices as Paid using the bank deposit date
      if (approvedInvoices.length > 0) {
        // Collect invoice numbers from matchId (set by the upload/route.ts AI matcher)
        const invoiceNumbers = approvedInvoices
          .map((inv: any) => inv.matchId)
          .filter(Boolean);   // Drop any entries without a matchId

        if (invoiceNumbers.length > 0) {
          // Fetch the real DB records to verify workspace ownership before updating
          const dbInvoices = await tx.invoice.findMany({
            where: {
              workspaceId,
              invoiceNumber: { in: invoiceNumbers },
            },
            select: { id: true, invoiceNumber: true, totalAmount: true },
          });

          // Update each matched invoice individually so we can apply the
          // correct bank-statement date per invoice (not just "today")
          for (const dbInv of dbInvoices) {
            const bankLine = approvedInvoices.find(
              (i: any) => i.matchId === dbInv.invoiceNumber
            );

            await tx.invoice.update({
              where: { id: dbInv.id },
              data: {
                status:         'PAID',
                // Use the actual bank deposit amount; fall back to billed amount
                amountReceived: bankLine?.amount
                  ? Math.abs(parseFloat(bankLine.amount))
                  : Number(dbInv.totalAmount),
                // Use the bank statement date for chronological tax accuracy
                dateReceived: bankLine?.date
                  ? new Date(bankLine.date)
                  : new Date(),
              },
            });
            invoicesReconciled++;
          }
        }
      }

      return { expensesCreated, invoicesReconciled };
    });

    // ── 5. SUCCESS RESPONSE ───────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      message: `Successfully logged ${result.expensesCreated} expense(s) and reconciled ${result.invoicesReconciled} invoice(s).`,
      expensesCreated:    result.expensesCreated,
      invoicesReconciled: result.invoicesReconciled,
    });

  } catch (error: any) {
    console.error("Reconciliation Commit Error:", error);
    return NextResponse.json(
      { error: 'Failed to write to ledger. The operation was rolled back. Please try again.' },
      { status: 500 }
    );
  }
}
