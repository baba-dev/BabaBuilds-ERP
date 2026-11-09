import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { scanBuffer } from '@/lib/security/clamav';
import { apiError } from "@/lib/api-error";
import { logActivity } from '@/lib/security/activity-log';
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import {
  ensureDir,
  sniffAllowedContent,
  uniqueStoredName,
  buildPrivatePath,
} from '@/lib/uploads/private-storage';
import { withPermission } from '@/lib/rbac';
import { expenseGstSchema, normalizeExpenseGst } from '@/lib/gst/expense-gst';
import { loadGstProfile } from '@/lib/gst/data';
import { createExpenseWithSideEffects } from '@/lib/expenses/create-expense-with-side-effects';

// Fetch all expenses for the ledger (NOW PAGINATED)
export async function GET(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return apiError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }
    const workspaceId = session.workspaceId;
    const whereClause = { workspaceId: workspaceId };

    // 2. GET PAGINATION PARAMS
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '15'); // Show 15 expenses per page
    const skip = (page - 1) * limit;

    // 3. FETCH PAGINATED DATA & TOTAL COUNT CONCURRENTLY
    const [expenses, totalExpenses] = await Promise.all([
      prisma.expense.findMany({
        where: whereClause,
        orderBy: { date: 'desc' },
        skip: skip,
        take: limit,
      }),
      prisma.expense.count({ where: whereClause })
    ]);
    
    // 4. RETURN STRUCTURED RESPONSE
    return NextResponse.json({
      data: expenses,
      meta: {
        currentPage: page,
        totalPages: Math.ceil(totalExpenses / limit),
        totalRecords: totalExpenses,
      }
    });

  } catch (error) {
    console.error("API Error fetching expenses:", error);
    return apiError(500, "Failed to fetch expenses", "EXPENSES_FETCH_FAILED");
  }
}

// Log a new expense and securely save the uploaded receipt
export async function POST(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return apiError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }
    const workspaceId = session.workspaceId;
    const userId = session.user?.id as string | undefined;
    if (!userId) return apiError(401, "Unauthorized", "AUTH_UNAUTHORIZED");

    // RBAC: creating an expense requires expenses.create permission
    const perm = await withPermission(userId, workspaceId, 'expenses.create');
    if (!perm.granted) return perm.response;

    const formData = await request.formData();
    
    // Extract text fields
    const date = formData.get('date') as string;
    const category = formData.get('category') as string;
    const vendor = formData.get('vendor') as string;
    const amount = formData.get('amount') as string;
    const description = formData.get('description') as string;
    const withholdingRatePercentRaw = formData.get('withholdingRatePercent') as string | null;
    const withholdingAmountRaw = formData.get('withholdingAmount') as string | null;
    const withholdingDeductedAtRaw = formData.get('withholdingDeductedAt') as string | null;
    const withholdingDepositedAtRaw = formData.get('withholdingDepositedAt') as string | null;
    const withholdingDepositDueAtRaw = formData.get('withholdingDepositDueAt') as string | null;
    const returnPeriodKeyRaw = formData.get('returnPeriodKey') as string | null;
    
    // --- 🚨 SECURITY PATCH: Prevent NaN Poisoning & Invalid Dates ---
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return apiError(400, "Invalid amount. Must be a positive number.", "INVALID_AMOUNT");
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return apiError(400, "Invalid date format.", "INVALID_DATE");
    }
    // ----------------------------------------------------------------


    const parsedWithholdingRate = withholdingRatePercentRaw && withholdingRatePercentRaw.trim() !== ''
      ? Number(withholdingRatePercentRaw)
      : null;
    if (parsedWithholdingRate !== null && (!Number.isFinite(parsedWithholdingRate) || parsedWithholdingRate < 0 || parsedWithholdingRate > 100)) {
      return apiError(400, "Invalid withholding rate percent.", "INVALID_WITHHOLDING_RATE");
    }

    const parsedWithholdingAmount = withholdingAmountRaw && withholdingAmountRaw.trim() !== ''
      ? Number(withholdingAmountRaw)
      : null;
    if (parsedWithholdingAmount !== null && (!Number.isFinite(parsedWithholdingAmount) || parsedWithholdingAmount < 0)) {
      return apiError(400, "Invalid withholding amount.", "INVALID_WITHHOLDING_AMOUNT");
    }

    const parsedWithholdingDeductedAt = withholdingDeductedAtRaw && withholdingDeductedAtRaw.trim() !== ''
      ? new Date(withholdingDeductedAtRaw)
      : null;
    if (parsedWithholdingDeductedAt && Number.isNaN(parsedWithholdingDeductedAt.getTime())) {
      return apiError(400, "Invalid withholding deduction date.", "INVALID_WITHHOLDING_DATE");
    }

    const parsedWithholdingDepositedAt = withholdingDepositedAtRaw && withholdingDepositedAtRaw.trim() !== ''
      ? new Date(withholdingDepositedAtRaw)
      : null;
    if (parsedWithholdingDepositedAt && Number.isNaN(parsedWithholdingDepositedAt.getTime())) {
      return apiError(400, "Invalid withholding deposited date.", "INVALID_WITHHOLDING_DATE");
    }

    const parsedWithholdingDepositDueAt = withholdingDepositDueAtRaw && withholdingDepositDueAtRaw.trim() !== ''
      ? new Date(withholdingDepositDueAtRaw)
      : null;
    if (parsedWithholdingDepositDueAt && Number.isNaN(parsedWithholdingDepositDueAt.getTime())) {
      return apiError(400, "Invalid withholding due date.", "INVALID_WITHHOLDING_DATE");
    }

    const hasWithholdingPayload =
      (withholdingRatePercentRaw && withholdingRatePercentRaw.trim() !== '') ||
      (withholdingAmountRaw && withholdingAmountRaw.trim() !== '') ||
      (withholdingDeductedAtRaw && withholdingDeductedAtRaw.trim() !== '') ||
      (withholdingDepositedAtRaw && withholdingDepositedAtRaw.trim() !== '') ||
      (withholdingDepositDueAtRaw && withholdingDepositDueAtRaw.trim() !== '') ||
      (returnPeriodKeyRaw && returnPeriodKeyRaw.trim() !== '');
    if (hasWithholdingPayload) {
      const whPerm = await withPermission(userId, workspaceId, 'tax.withholding.record');
      if (!whPerm.granted) return whPerm.response;
    }

    // GST on the bill (optional). Tax amounts are always computed here from the rate, never trusted from the client.
    const gstField = (k: string) => { const v = formData.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
    const gstRateRaw = gstField('gstRate');
    const gstParsed = expenseGstSchema.safeParse({
      itcStatus: gstField('itcStatus') ?? 'NONE',
      vendorGstin: gstField('vendorGstin'),
      vendorInvoiceNo: gstField('vendorInvoiceNo'),
      vendorStateCode: gstField('vendorStateCode'),
      hsnCode: gstField('hsnCode'),
      gstRate: gstRateRaw === null ? null : Number(gstRateRaw),
      paymentStatus: gstField('paymentStatus') ?? 'PAID',
      vendorMsme: gstField('vendorMsme'),
      vendorUdyam: gstField('vendorUdyam'),
      vendorAgreedDays: gstField('vendorAgreedDays') === null ? null : Number(gstField('vendorAgreedDays')),
    });
    if (!gstParsed.success) return apiError(400, "Invalid GST details.", "INVALID_GST");
    const gstProfile = gstParsed.data.itcStatus !== 'NONE' || gstParsed.data.vendorGstin ? await loadGstProfile(workspaceId) : null;
    const gstNormalized = normalizeExpenseGst(gstParsed.data, parsedAmount, gstProfile?.stateCode ?? null);
    if (!gstNormalized.ok) return apiError(400, gstNormalized.message, gstNormalized.code);

    // Extract the file
    const file = formData.get('receipt') as File | null;
    let receiptUrl = null;

    // Prevent processing of empty/ghost files
    if (file && file.size > 0) {
      const ext = path.extname(file.name).toLowerCase();
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.pdf']; // PDFs are okay for receipts
      if (!allowedExtensions.includes(ext)) {
        return apiError(400, "Invalid file type. Only images/PDFs are allowed.", "INVALID_FILE_TYPE");
      }
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const isSafe = await scanBuffer(buffer);
      if (!isSafe) {
        return apiError(400, "Malware detected in uploaded file.", "MALWARE_DETECTED");
      }

      const sniffed = sniffAllowedContent(buffer);
      if (!sniffed || (sniffed !== 'pdf' && sniffed !== 'png' && sniffed !== 'jpeg' && sniffed !== 'webp' && sniffed !== 'gif')) {
        return apiError(415, "Unsupported or unsafe receipt content.", "INVALID_FILE_TYPE");
      }
      if (sniffed === 'pdf' && ext !== '.pdf') {
        return apiError(415, "Receipt content did not match expected PDF type.", "INVALID_FILE_TYPE");
      }

      const receiptsDir = buildPrivatePath('receipts', [workspaceId]);
      await ensureDir(receiptsDir);
      const storedName = uniqueStoredName('receipt', ext);
      const filepath = path.join(receiptsDir, storedName);

      await fs.promises.writeFile(filepath, buffer, { mode: 0o600 });
      receiptUrl = `/receipts/${workspaceId}/${storedName}`;
    }

    const newExpense = await createExpenseWithSideEffects({
      workspaceId,
      userId,
      request,
      date: parsedDate,
      category,
      vendor,
      amount: parsedAmount,
      description: description || null,
      receiptUrl,
      withholdingRatePercent: parsedWithholdingRate,
      explicitWithholdingAmount: parsedWithholdingAmount,
      withholdingDeductedAt: parsedWithholdingDeductedAt,
      withholdingDepositedAt: parsedWithholdingDepositedAt,
      withholdingDepositDueAt: parsedWithholdingDepositDueAt,
      returnPeriodKeyRaw,
      gst: gstNormalized.data,
    });

    // Intentional duplicate safety invalidation so this endpoint remains KPI-cover compliant.
    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'expense', action: 'create' });
    }

    return NextResponse.json({ success: true, expense: newExpense });

  } catch (error) {
    console.error('Expense logging error:', error);
    logActivity({
      action: "expense_created",
      status: "FAILURE",
      workspaceId: null,
      request,
      metadata: { error: String(error) },
    });
    return apiError(500, "Failed to log expense and save receipt", "EXPENSE_CREATE_FAILED");
  }
}
