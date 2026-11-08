import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { parseExpenseUpdatePayload } from '@/lib/types/business';
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import { withPermission } from '@/lib/rbac';
import { expenseGstSchema, normalizeExpenseGst } from '@/lib/gst/expense-gst';
import { loadGstProfile } from '@/lib/gst/data';

const getWorkspaceId = (session: unknown) => {
  if (!session || typeof session !== "object") return null;
  const workspaceId = (session as { workspaceId?: unknown }).workspaceId;
  return typeof workspaceId === "string" ? workspaceId : null;
};

const apiError = (status: number, error: string, code: string) =>
  NextResponse.json({ success: false, error: { error, code } }, { status });

// UPDATE EXPENSE
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = getWorkspaceId(session);
    const userId = session?.user?.id as string | undefined;
    if (!workspaceId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // RBAC: editing an expense requires expenses.create permission
    const perm = await withPermission(userId, workspaceId, 'expenses.create');
    if (!perm.granted) return perm.response;
    const resolvedParams = await params;
    const expenseId = resolvedParams.id;

    const rawBody = await request.json();
    const parsedPayload = parseExpenseUpdatePayload(rawBody);
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

    // GST block is optional; when present it is validated and the tax split is recomputed for the (possibly new) amount.
    let gstData: Record<string, unknown> = {};
    const rawGst = (rawBody as { gst?: unknown } | null)?.gst;
    if (rawGst !== undefined) {
      const parsedGst = expenseGstSchema.safeParse(rawGst);
      if (!parsedGst.success) return apiError(400, "Invalid GST details.", "INVALID_GST");
      const profile = await loadGstProfile(workspaceId);
      const normalized = normalizeExpenseGst(parsedGst.data, amount, profile.stateCode);
      if (!normalized.ok) return apiError(400, normalized.message, normalized.code);
      gstData = normalized.data;
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
        ...gstData,
      }
    });

    if (updatedExpense.count === 0) {
      return apiError(404, "Expense not found or unauthorized.", "EXPENSE_NOT_FOUND");
    }

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'expense', action: 'update', error: String(error) });
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
    const userId = session?.user?.id as string | undefined;
    if (!workspaceId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // RBAC: deleting an expense requires expenses.delete permission
    const perm = await withPermission(userId, workspaceId, 'expenses.delete');
    if (!perm.granted) return perm.response;
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

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'expense', action: 'delete', error: String(error) });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Expense Deletion Error:", error);
    return apiError(500, "Failed to delete expense.", "EXPENSE_DELETE_FAILED");
  }
}
