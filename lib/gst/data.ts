import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyInvoice, normalizeHsn, type ClassifiedInvoice, type InvoiceInput } from "./classify";
import type { CreditNoteInput } from "./gstr1";
import type { AdjustmentInput, ExpenseGstInput } from "./books";
import type { FilingFrequency, GstSettings, RegistrationType } from "./calendar";
import { normalizeGstin, validateGstin } from "./gstin";
import { num, r2 } from "./money";

export type GstProfile = GstSettings & {
  workspaceId: string;
  companyName: string;
  gstin: string | null;
  gstinValid: boolean;
  prevTurnover: number;
  registeredFrom: Date | null;
  lutActive: boolean;
  countryCode: string;
  hasProfile: boolean;
};

export async function loadGstProfile(workspaceId: string): Promise<GstProfile> {
  const [profile, ws] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { workspaceId },
      select: { companyName: true, gstin: true, gstStateCode: true, gstRegistrationType: true, gstFilingFrequency: true, gstPrevFyTurnover: true, gstRegisteredFrom: true, gstLutActive: true },
    }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { countryCode: true } }),
  ]);
  const gstin = normalizeGstin(profile?.gstin) || null;
  const check = gstin ? validateGstin(gstin) : null;
  // The state of a valid GSTIN is authoritative over a hand-typed state.
  const stateCode = check && check.valid ? check.stateCode : profile?.gstStateCode ?? null;
  const reg = (profile?.gstRegistrationType ?? "REGULAR") as RegistrationType;
  const freq = (profile?.gstFilingFrequency ?? "MONTHLY") as FilingFrequency;
  return {
    workspaceId,
    companyName: profile?.companyName ?? "",
    gstin,
    gstinValid: !!check && check.valid,
    stateCode,
    registrationType: reg === "COMPOSITION" || reg === "UNREGISTERED" ? reg : "REGULAR",
    filingFrequency: freq === "QRMP" ? "QRMP" : "MONTHLY",
    prevTurnover: num(profile?.gstPrevFyTurnover),
    registeredFrom: profile?.gstRegisteredFrom ?? null,
    lutActive: profile?.gstLutActive ?? true,
    countryCode: (ws?.countryCode ?? "IN").toUpperCase(),
    hasProfile: !!profile,
  };
}

const invoiceSelect = {
  id: true,
  invoiceNumber: true,
  invoiceDate: true,
  status: true,
  voidedAt: true,
  exchangeRate: true,
  subtotal: true,
  taxAmount: true,
  grandTotal: true,
  totalAmount: true,
  taxRate: true,
  taxMode: true,
  sacCode: true,
  clientId: true,
  clientName: true,
  gstPlaceOfSupply: true,
  gstReverseCharge: true,
  client: { select: { country: true, taxId: true, gstStateCode: true } },
  items: { select: { description: true, quantity: true, totalAmount: true, taxRate: true, sacCode: true } },
} satisfies Prisma.InvoiceSelect;

type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }>;

export function toInvoiceInput(row: InvoiceRow): InvoiceInput {
  const total = num(row.grandTotal) > 0 ? num(row.grandTotal) : num(row.totalAmount);
  // Legacy rows can carry subtotal = 0 with the real amounts only in the total columns.
  const subtotal = num(row.subtotal) > 0 ? num(row.subtotal) : Math.max(0, total - num(row.taxAmount));
  const itemSum = row.items.reduce((s, i) => s + num(i.totalAmount), 0);
  // Items normally sum to the subtotal; when a source stored them differently, scale to the booked subtotal.
  const scale = subtotal > 0 && itemSum > 0 && Math.abs(itemSum - subtotal) > 0.5 ? subtotal / itemSum : 1;
  return {
    id: row.id,
    number: row.invoiceNumber,
    date: row.invoiceDate,
    voided: row.status === "VOID",
    voidedAt: row.voidedAt,
    exchangeRate: num(row.exchangeRate) || 1,
    subtotal,
    taxAmount: num(row.taxAmount),
    total,
    taxRate: num(row.taxRate),
    sacCode: row.sacCode,
    isExemptMode: row.taxMode === "exempt",
    items: row.items.map((i) => ({ description: i.description, quantity: i.quantity, amount: r2(num(i.totalAmount) * scale), taxRate: num(i.taxRate), sacCode: i.sacCode })),
    clientId: row.clientId,
    clientName: row.clientName,
    recipientGstin: row.client?.taxId ?? null,
    clientCountry: row.client?.country ?? null,
    clientStateCode: row.client?.gstStateCode ?? null,
    placeOfSupplyOverride: row.gstPlaceOfSupply,
    reverseCharge: row.gstReverseCharge,
  };
}

export type GstBooks = {
  invoices: ClassifiedInvoice[];
  creditNotes: CreditNoteInput[];
  expenses: ExpenseGstInput[];
  adjustments: AdjustmentInput[];
};

const monthKeyOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Load everything dated in [from, to] that GST cares about. */
export async function loadGstBooks(profile: GstProfile, from: Date, to: Date): Promise<GstBooks> {
  const workspaceId = profile.workspaceId;
  const [invoiceRows, noteRows, expenseRows, adjustmentRows] = await Promise.all([
    prisma.invoice.findMany({ where: { workspaceId, invoiceDate: { gte: from, lte: to } }, select: invoiceSelect, orderBy: { invoiceDate: "asc" } }),
    prisma.creditNote.findMany({
      where: { workspaceId, issuedAt: { gte: from, lte: to } },
      select: { id: true, creditNoteNumber: true, issuedAt: true, amount: true, taxAmount: true, reason: true, invoice: { select: invoiceSelect } },
      orderBy: { issuedAt: "asc" },
    }),
    prisma.expense.findMany({
      where: { workspaceId, date: { gte: from, lte: to }, itcStatus: { not: "NONE" } },
      orderBy: { date: "asc" },
    }),
    prisma.gstAdjustment.findMany({ where: { workspaceId, periodKey: { gte: monthKeyOf(from), lte: monthKeyOf(to) } } }),
  ]);

  const invoices = invoiceRows.map((r) => classifyInvoice(toInvoiceInput(r), profile.stateCode));
  const creditNotes: CreditNoteInput[] = noteRows.map((n) => {
    const input = toInvoiceInput(n.invoice);
    return {
      id: n.id,
      number: n.creditNoteNumber,
      date: n.issuedAt,
      amount: num(n.amount),
      taxAmount: num(n.taxAmount),
      reason: n.reason,
      invoice: classifyInvoice(input, profile.stateCode),
      invoiceSubtotalBooked: input.subtotal,
      exchangeRate: input.exchangeRate,
    };
  });
  const expenses: ExpenseGstInput[] = expenseRows.map((e) => ({
    id: e.id,
    date: e.date,
    vendor: e.vendor,
    vendorGstin: e.vendorGstin ? normalizeGstin(e.vendorGstin) : null,
    vendorInvoiceNo: e.vendorInvoiceNo,
    vendorStateCode: e.vendorStateCode,
    category: e.category,
    hsn: normalizeHsn(e.hsnCode),
    rate: e.gstRate,
    amount: num(e.amount),
    igst: num(e.igstAmount),
    cgst: num(e.cgstAmount),
    sgst: num(e.sgstAmount),
    cess: num(e.cessAmount),
    itcStatus: e.itcStatus,
  }));
  const adjustments: AdjustmentInput[] = adjustmentRows.map((a) => ({
    id: a.id,
    periodKey: a.periodKey,
    kind: a.kind,
    igst: num(a.igst),
    cgst: num(a.cgst),
    sgst: num(a.sgst),
    cess: num(a.cess),
    notes: a.notes,
  }));
  return { invoices, creditNotes, expenses, adjustments };
}

export const inMonthRange = (d: Date, start: Date, end: Date) => d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
export { monthKeyOf };
