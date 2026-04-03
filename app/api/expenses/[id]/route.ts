import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';

// UPDATE EXPENSE
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
    const resolvedParams = await params;
    const expenseId = resolvedParams.id;

    const body = await request.json();
    const { date, category, vendor, amount, description } = body;

    // --- 🚨 SECURITY PATCH: Prevent NaN Poisoning & Invalid Dates ---
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return NextResponse.json({ error: "Invalid amount. Must be a positive number." }, { status: 400 });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
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
      return NextResponse.json({ error: "Expense not found or unauthorized." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Expense Update Error:", error);
    return NextResponse.json({ error: "Failed to update expense." }, { status: 500 });
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
    const resolvedParams = await params;
    const expenseId = resolvedParams.id;

    // 1. Fetch to get the receipt URL for cleanup
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, workspaceId: workspaceId }
    });

    if (!expense) {
      return NextResponse.json({ error: "Expense not found or unauthorized." }, { status: 404 });
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
    return NextResponse.json({ error: "Failed to delete expense." }, { status: 500 });
  }
}