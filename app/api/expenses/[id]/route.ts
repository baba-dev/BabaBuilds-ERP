import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { parseExpenseUpdatePayload } from '@/lib/types/business';

const getWorkspaceId = (session: unknown) => {
  if (!session || typeof session !== "object") return null;
  const workspaceId = (session as { workspaceId?: unknown }).workspaceId;
  return typeof workspaceId === "string" ? workspaceId : null;
};

// UPDATE EXPENSE
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = getWorkspaceId(session);
    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const resolvedParams = await params;
    const expenseId = resolvedParams.id;

    const parsedPayload = parseExpenseUpdatePayload(await request.json());
    if (!parsedPayload) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    const { date, category, vendor, amount, description } = parsedPayload;

    // --- 🚨 SECURITY PATCH: Prevent NaN Poisoning & Invalid Dates ---
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "Invalid amount. Must be a positive number." }, { status: 400 });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return apiError(400, "Invalid date format.", "INVALID_DATE");
    }

    const updatedExpense = await prisma.expense.updateMany({
      where: { 
        id: expenseId,
        workspaceId: workspaceId // Secure tenant lock
      },
      data: {
        date: parsedDate,
        category,
        vendor,
        amount,
        description: description || null,
      }
    });

    if (updatedExpense.count === 0) {
      return apiError(404, "Expense not found or unauthorized.", "EXPENSE_NOT_FOUND");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Expense Update Error:", error);
    return apiError(500, "Failed to update expense.", "EXPENSE_UPDATE_FAILED");
  }
}

// DELETE EXPENSE
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = getWorkspaceId(session);
    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const resolvedParams = await params;
    const expenseId = resolvedParams.id;

    // 1. Fetch to get the receipt URL for cleanup
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, workspaceId: workspaceId }
    });

    if (!expense) {
      return apiError(404, "Expense not found or unauthorized.", "EXPENSE_NOT_FOUND");
    }

    // 2. Delete from Database
    await prisma.expense.delete({
      where: { id: expenseId }
    });

    // 3. Cleanup Orphaned Receipt File
    if (expense.receiptUrl) {
      const relativeReceiptPath = expense.receiptUrl.startsWith('/') 
        ? expense.receiptUrl.substring(1) 
        : expense.receiptUrl;
      const filePath = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', relativeReceiptPath);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.error("Failed to delete receipt file:", e);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Expense Deletion Error:", error);
    return apiError(500, "Failed to delete expense.", "EXPENSE_DELETE_FAILED");
  }
}
