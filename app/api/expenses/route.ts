import { NextResponse } from "next/server";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { asPeriodKey, resolvePeriod } from "@/lib/expenses/period";
import { findDuplicateExpenses, listExpenses } from "@/lib/expenses/queries";
import { removeReceiptFile, storeReceipt } from "@/lib/expenses/service";
import { normalizeExpenseCore } from "@/lib/expenses/validate";
import { createExpenseWithSideEffects } from "@/lib/expenses/create-expense-with-side-effects";
import { expenseGstSchema, normalizeExpenseGst } from "@/lib/gst/expense-gst";
import { loadGstProfile } from "@/lib/gst/data";
import { withPermission } from "@/lib/rbac";
import { logActivity } from "@/lib/security/activity-log";

const intParam = (v: string | null): number | undefined | typeof Number.NaN => {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : Number.NaN;
};

/** The ledger: filtered, searched and sorted on the server. `period` is this_month, last_month, this_fy, last_fy, all or custom (with from and to). */
export async function GET(request: Request) {
  const auth = await requireExpenseAccess("expenses.view");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;
  const sp = new URL(request.url).searchParams;
  const page = intParam(sp.get("page"));
  const limit = intParam(sp.get("limit"));
  if (Number.isNaN(page) || Number.isNaN(limit) || (page !== undefined && page < 1) || (limit !== undefined && limit < 1)) return expenseError(400, "PAGINATION_INVALID_PARAMS", "Invalid pagination parameters");
  try {
    const sort = sp.get("sort");
    const status = sp.get("status");
    const receipt = sp.get("receipt");
    const itc = sp.get("itc");
    const result = await listExpenses(ctx.workspaceId, {
      q: sp.get("q") ?? undefined,
      category: sp.get("category") ?? undefined,
      status: status === "paid" || status === "unpaid" ? status : undefined,
      receipt: receipt === "with" || receipt === "without" ? receipt : undefined,
      itc: itc === "eligible" || itc === "blocked" ? itc : undefined,
      range: resolvePeriod(asPeriodKey(sp.get("period") ?? "all"), ctx.countryCode, new Date(), { from: sp.get("from"), to: sp.get("to") }),
      sort: sort === "amount" || sort === "vendor" ? sort : "date",
      dir: sp.get("dir") === "asc" ? "asc" : "desc",
      page, limit,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("API Error fetching expenses:", error);
    return expenseError(500, "EXPENSES_FETCH_FAILED", "Failed to fetch expenses");
  }
}

const text = (form: FormData, k: string) => { const v = form.get(k); return typeof v === "string" && v.trim() !== "" ? v.trim() : null; };
const dateOrNull = (v: string | null) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? Number.NaN : d; };

export async function POST(request: Request) {
  const auth = await requireExpenseAccess("expenses.create");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;
  let storedReceipt: string | null = null;
  try {
    const form = await request.formData();
    const core = normalizeExpenseCore({ date: form.get("date"), category: form.get("category"), vendor: form.get("vendor"), amount: form.get("amount"), description: form.get("description") });
    if (!core.ok) return NextResponse.json({ error: "Check the highlighted fields.", code: "VALIDATION", fields: core.fields }, { status: 422 });
    const { date, category, vendor, amount, description } = core.data as { date: Date; category: string; vendor: string; amount: number; description: string | null };

    const rate = text(form, "withholdingRatePercent");
    const whAmount = text(form, "withholdingAmount");
    const deducted = dateOrNull(text(form, "withholdingDeductedAt"));
    const deposited = dateOrNull(text(form, "withholdingDepositedAt"));
    const dueAt = dateOrNull(text(form, "withholdingDepositDueAt"));
    const returnPeriodKey = text(form, "returnPeriodKey");
    const rateN = rate === null ? null : Number(rate);
    const whAmountN = whAmount === null ? null : Number(whAmount);
    if (rateN !== null && (!Number.isFinite(rateN) || rateN < 0 || rateN > 100)) return expenseError(400, "INVALID_WITHHOLDING_RATE", "Invalid withholding rate percent.");
    if (whAmountN !== null && (!Number.isFinite(whAmountN) || whAmountN < 0)) return expenseError(400, "INVALID_WITHHOLDING_AMOUNT", "Invalid withholding amount.");
    if ([deducted, deposited, dueAt].some((d) => d !== null && Number.isNaN((d as Date).getTime()))) return expenseError(400, "INVALID_WITHHOLDING_DATE", "Invalid withholding date.");
    if (rate || whAmount || deducted || deposited || dueAt || returnPeriodKey) {
      const wh = await withPermission(ctx.userId, ctx.workspaceId, "tax.withholding.record");
      if (!wh.granted) return wh.response;
    }

    const gstRate = text(form, "gstRate");
    const agreed = text(form, "vendorAgreedDays");
    const gstParsed = expenseGstSchema.safeParse({
      itcStatus: text(form, "itcStatus") ?? "NONE", vendorGstin: text(form, "vendorGstin"), vendorInvoiceNo: text(form, "vendorInvoiceNo"), vendorStateCode: text(form, "vendorStateCode"), hsnCode: text(form, "hsnCode"),
      gstRate: gstRate === null ? null : Number(gstRate), paymentStatus: text(form, "paymentStatus") ?? "PAID", vendorMsme: text(form, "vendorMsme"), vendorUdyam: text(form, "vendorUdyam"), vendorAgreedDays: agreed === null ? null : Number(agreed),
    });
    if (!gstParsed.success) return expenseError(400, "INVALID_GST", "Invalid GST details.");
    const gstProfile = gstParsed.data.itcStatus !== "NONE" || gstParsed.data.vendorGstin ? await loadGstProfile(ctx.workspaceId) : null;
    const gst = normalizeExpenseGst(gstParsed.data, amount, gstProfile?.stateCode ?? null);
    if (!gst.ok) return expenseError(400, gst.code, gst.message);

    if (form.get("force") !== "true") {
      const dup = await findDuplicateExpenses(ctx.workspaceId, { vendor, amount, date, invoiceNo: gst.data.vendorInvoiceNo });
      if (dup.length) return expenseError(409, "EXPENSE_DUPLICATE", `${vendor} already has a similar expense.`, { existing: dup });
    }

    const file = form.get("receipt");
    if (file instanceof File && file.size > 0) {
      const stored = await storeReceipt(ctx.workspaceId, file);
      if (!stored.ok) return stored.response;
      storedReceipt = stored.url;
    }

    const expense = await createExpenseWithSideEffects({
      workspaceId: ctx.workspaceId, userId: ctx.userId, request, date, category, vendor, amount, description, receiptUrl: storedReceipt,
      withholdingRatePercent: rateN, explicitWithholdingAmount: whAmountN, withholdingDeductedAt: deducted as Date | null, withholdingDepositedAt: deposited as Date | null, withholdingDepositDueAt: dueAt as Date | null,
      returnPeriodKeyRaw: returnPeriodKey, gst: gst.data,
    });
    return NextResponse.json({ success: true, expense }, { status: 201 });
  } catch (error) {
    console.error("Expense logging error:", error);
    await removeReceiptFile(storedReceipt);
    void logActivity({ action: "expense_created", status: "FAILURE", workspaceId: ctx.workspaceId, request, metadata: { error: String(error) } });
    return expenseError(500, "EXPENSE_CREATE_FAILED", "Failed to log expense and save receipt");
  }
}
