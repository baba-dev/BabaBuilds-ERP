import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { apiError } from "@/lib/api-error";

// UPDATE EXPENSE
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return apiError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }
    const workspaceId = (session as any).workspaceId;
    const resolvedParams = await params;
    const expenseId = resolvedParams.id;

    const body = await request.json();
    const { date, category, vendor, amount, description } = body;

    // --- 🚨 SECURITY PATCH: Prevent NaN Poisoning & Invalid Dates ---
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return apiError(400, "Invalid amount. Must be a positive number.", "INVALID_AMOUNT");
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
        amount: parsedAmount,
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
    if (!session || !(session as any).workspaceId) {
      return apiError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }
    const workspaceId = (session as any).workspaceId;
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
