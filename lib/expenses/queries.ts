import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PRESET_CATEGORIES } from "./categories";
import { previousRange, type PeriodRange } from "./period";

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const DAY = 86_400_000;

export type ExpenseListQuery = {
  q?: string; category?: string; status?: "paid" | "unpaid"; receipt?: "with" | "without"; itc?: "eligible" | "blocked";
  range: PeriodRange; sort?: "date" | "amount" | "vendor"; dir?: "asc" | "desc"; page?: number; limit?: number;
};

export function expenseWhere(workspaceId: string, q: Omit<ExpenseListQuery, "sort" | "dir" | "page" | "limit">): Prisma.ExpenseWhereInput {
  const and: Prisma.ExpenseWhereInput[] = [];
  const range = q.range;
  if (range.from || range.to) and.push({ date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) } });
  const text = q.q?.trim();
  if (text) and.push({ OR: [{ vendor: { contains: text } }, { description: { contains: text } }, { category: { contains: text } }, { vendorInvoiceNo: { contains: text } }, { vendorGstin: { contains: text.toUpperCase() } }] });
  if (q.category) and.push({ category: q.category });
  if (q.status === "paid") and.push({ paymentStatus: "PAID" });
  if (q.status === "unpaid") and.push({ paymentStatus: "UNPAID" });
  if (q.receipt === "with") and.push({ receiptUrl: { not: null } });
  if (q.receipt === "without") and.push({ receiptUrl: null });
  if (q.itc === "eligible") and.push({ itcStatus: "ELIGIBLE" });
  if (q.itc === "blocked") and.push({ itcStatus: "INELIGIBLE" });
  return { workspaceId, AND: and };
}

export function shapeExpense(e: Prisma.ExpenseGetPayload<object>) {
  const gst = num(e.igstAmount) + num(e.cgstAmount) + num(e.sgstAmount) + num(e.cessAmount);
  return {
    id: e.id, date: e.date.toISOString(), category: e.category, vendor: e.vendor, amount: num(e.amount), description: e.description, receiptUrl: e.receiptUrl,
    itcStatus: e.itcStatus, vendorGstin: e.vendorGstin, vendorInvoiceNo: e.vendorInvoiceNo, vendorStateCode: e.vendorStateCode, hsnCode: e.hsnCode, gstRate: e.gstRate,
    igstAmount: num(e.igstAmount), cgstAmount: num(e.cgstAmount), sgstAmount: num(e.sgstAmount), cessAmount: num(e.cessAmount), gstAmount: r2(gst),
    paymentStatus: e.paymentStatus, paidAt: e.paidAt ? e.paidAt.toISOString() : null, itcHeld: e.itcHeld, itcClaimMonth: e.itcClaimMonth,
    vendorMsme: e.vendorMsme, vendorUdyam: e.vendorUdyam, vendorAgreedDays: e.vendorAgreedDays,
    withholdingAmount: e.withholdingAmount === null ? null : num(e.withholdingAmount), withholdingRatePercent: e.withholdingRatePercent === null ? null : num(e.withholdingRatePercent),
    withholdingDeductedAt: e.withholdingDeductedAt ? e.withholdingDeductedAt.toISOString() : null, withholdingDepositedAt: e.withholdingDepositedAt ? e.withholdingDepositedAt.toISOString() : null,
    ageDays: e.paymentStatus === "UNPAID" ? Math.max(0, Math.floor((Date.now() - e.date.getTime()) / DAY)) : null,
  };
}

export async function listExpenses(workspaceId: string, q: ExpenseListQuery) {
  const limit = Math.min(100, Math.max(1, Math.trunc(q.limit ?? 20)));
  const page = Math.max(1, Math.trunc(q.page ?? 1));
  const where = expenseWhere(workspaceId, q);
  const dir = q.dir === "asc" ? "asc" : "desc";
  const orderBy: Prisma.ExpenseOrderByWithRelationInput[] = q.sort === "amount" ? [{ amount: dir }, { date: "desc" }] : q.sort === "vendor" ? [{ vendor: dir }, { date: "desc" }] : [{ date: dir }, { createdAt: "desc" }];
  const [rows, total, agg] = await Promise.all([
    prisma.expense.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
  ]);
  return { data: rows.map(shapeExpense), meta: { currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)), totalRecords: total }, filteredTotal: r2(num(agg._sum.amount)) };
}

/** Distinct categories and recent vendors, so the form can suggest what the workspace already uses. */
export async function expenseMeta(workspaceId: string) {
  const [cats, vendors] = await Promise.all([
    prisma.expense.groupBy({ by: ["category"], where: { workspaceId }, _count: { _all: true }, orderBy: { _count: { category: "desc" } }, take: 60 }),
    prisma.expense.groupBy({ by: ["vendor"], where: { workspaceId }, _count: { _all: true }, _max: { date: true }, orderBy: { _count: { vendor: "desc" } }, take: 40 }),
  ]);
  const preset = new Set<string>(PRESET_CATEGORIES.map((c) => c.value));
  return { categories: cats.map((c) => c.category).filter((c) => !preset.has(c)), vendors: vendors.map((v) => v.vendor) };
}

export async function expenseSummary(workspaceId: string, range: PeriodRange, now = new Date()) {
  const where = expenseWhere(workspaceId, { range });
  const prev = previousRange(range);
  const sixStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const invDate = range.from || range.to ? { invoiceDate: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) } } : {};

  const [total, byCat, byVendor, itc, unpaid, unpaidItems, missing, whPending, series, revenue, ws] = await Promise.all([
    prisma.expense.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.expense.groupBy({ by: ["category"], where, _sum: { amount: true }, _count: { _all: true }, orderBy: { _sum: { amount: "desc" } }, take: 12 }),
    prisma.expense.groupBy({ by: ["vendor"], where, _sum: { amount: true }, _count: { _all: true }, orderBy: { _sum: { amount: "desc" } }, take: 5 }),
    prisma.expense.aggregate({ where: { ...where, itcStatus: "ELIGIBLE", itcHeld: false }, _sum: { igstAmount: true, cgstAmount: true, sgstAmount: true, cessAmount: true } }),
    prisma.expense.aggregate({ where: { workspaceId, paymentStatus: "UNPAID" }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.expense.findMany({ where: { workspaceId, paymentStatus: "UNPAID" }, orderBy: { date: "asc" }, take: 6, select: { id: true, vendor: true, amount: true, date: true, vendorInvoiceNo: true, vendorMsme: true, vendorAgreedDays: true } }),
    prisma.expense.count({ where: { ...where, receiptUrl: null } }),
    prisma.expense.aggregate({ where: { workspaceId, withholdingDeductedAt: { not: null }, withholdingDepositedAt: null }, _sum: { withholdingAmount: true }, _count: { _all: true } }),
    prisma.expense.findMany({ where: { workspaceId, date: { gte: sixStart } }, select: { date: true, amount: true }, take: 20000 }),
    prisma.invoice.aggregate({ where: { workspaceId, status: { not: "VOID" }, voidedAt: null, ...invDate }, _sum: { baseGrandTotal: true, grandTotal: true } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } }),
  ]);
  const prevTotal = prev ? num((await prisma.expense.aggregate({ where: expenseWhere(workspaceId, { range: prev }), _sum: { amount: true } }))._sum.amount) : null;

  const totalAmount = num(total._sum.amount);
  const itcClaimable = num(itc._sum.igstAmount) + num(itc._sum.cgstAmount) + num(itc._sum.sgstAmount) + num(itc._sum.cessAmount);
  const monthly = new Map<string, number>();
  for (let i = 5; i >= 0; i--) monthly.set(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7), 0);
  for (const r of series) { const k = r.date.toISOString().slice(0, 7); if (monthly.has(k)) monthly.set(k, (monthly.get(k) ?? 0) + num(r.amount)); }
  const revenueTotal = num(revenue._sum.baseGrandTotal ?? revenue._sum.grandTotal);

  return {
    currency: ws?.baseCurrency ?? "INR",
    range: { key: range.key, from: range.from ? range.from.toISOString() : null, to: range.to ? range.to.toISOString() : null },
    total: r2(totalAmount), count: total._count._all, prevTotal: prevTotal === null ? null : r2(prevTotal),
    netOfCredit: r2(totalAmount - itcClaimable), itcClaimable: r2(itcClaimable),
    revenue: r2(revenueTotal), margin: revenueTotal > 0 ? r2(((revenueTotal - (totalAmount - itcClaimable)) / revenueTotal) * 100) : null,
    byCategory: byCat.map((c) => ({ category: c.category, amount: r2(num(c._sum.amount)), count: c._count._all, share: totalAmount > 0 ? r2((num(c._sum.amount) / totalAmount) * 100) : 0 })),
    topVendors: byVendor.map((v) => ({ vendor: v.vendor, amount: r2(num(v._sum.amount)), count: v._count._all })),
    monthly: [...monthly.entries()].map(([month, amount]) => ({ month, amount: r2(amount) })),
    unpaid: { count: unpaid._count._all, amount: r2(num(unpaid._sum.amount)), items: unpaidItems.map((u) => ({ id: u.id, vendor: u.vendor, amount: num(u.amount), date: u.date.toISOString(), invoiceNo: u.vendorInvoiceNo, ageDays: Math.floor((now.getTime() - u.date.getTime()) / DAY), msme: u.vendorMsme, agreedDays: u.vendorAgreedDays })) },
    missingReceipts: missing,
    withholdingPending: { count: whPending._count._all, amount: r2(num(whPending._sum.withholdingAmount)) },
  };
}

/** Likely double entries: same supplier invoice, or same vendor, amount and (within a day) date. */
export async function findDuplicateExpenses(workspaceId: string, input: { vendor: string; amount: number; date: Date; invoiceNo?: string | null; excludeId?: string }) {
  const or: Prisma.ExpenseWhereInput[] = [{ vendor: input.vendor, amount: input.amount, date: { gte: new Date(input.date.getTime() - DAY), lte: new Date(input.date.getTime() + DAY) } }];
  if (input.invoiceNo) or.push({ vendor: input.vendor, vendorInvoiceNo: input.invoiceNo });
  const rows = await prisma.expense.findMany({ where: { workspaceId, OR: or, ...(input.excludeId ? { NOT: { id: input.excludeId } } : {}) }, take: 3, orderBy: { date: "desc" }, select: { id: true, vendor: true, amount: true, date: true, vendorInvoiceNo: true } });
  return rows.map((r) => ({ id: r.id, vendor: r.vendor, amount: num(r.amount), date: r.date.toISOString(), invoiceNo: r.vendorInvoiceNo }));
}
