import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyInvoice, normalizeHsn, type ClassifiedInvoice, type InvoiceInput } from "./classify";
import type { AdvanceInput, AmendmentInput, CreditNoteInput, DebitNoteInput } from "./gstr1";
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
  remindersEnabled: boolean;
  address: string;
  email: string;
};

export async function loadGstProfile(workspaceId: string): Promise<GstProfile> {
  const [profile, ws] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { workspaceId },
      select: { companyName: true, gstin: true, gstStateCode: true, gstRegistrationType: true, gstFilingFrequency: true, gstPrevFyTurnover: true, gstRegisteredFrom: true, gstLutActive: true, gstRemindersEnabled: true, address: true, email: true },
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
    remindersEnabled: profile?.gstRemindersEnabled ?? true,
    address: profile?.address ?? "",
    email: profile?.email ?? "",
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
  gstSupplyOverride: true,
  gstEcoGstin: true,
  irn: true,
  irnAckNo: true,
  irnAckDate: true,
  ewayBillNo: true,
  client: { select: { country: true, taxId: true, gstStateCode: true } },
  items: { select: { description: true, quantity: true, totalAmount: true, taxRate: true, sacCode: true } },
} satisfies Prisma.InvoiceSelect;

export const invoiceGstSelect = invoiceSelect;
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
    supplyOverride: row.gstSupplyOverride,
    ecoGstin: row.gstEcoGstin,
    irn: row.irn,
    irnAckDate: row.irnAckDate,
    ewayBillNo: row.ewayBillNo,
  };
}

export type GstBooks = {
  invoices: ClassifiedInvoice[];
  creditNotes: CreditNoteInput[];
  expenses: ExpenseGstInput[];
  adjustments: AdjustmentInput[];
  debitNotes: DebitNoteInput[];
  amendments: AmendmentInput[];
  advances: AdvanceInput[];
};

const monthKeyOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Load everything dated in [from, to] that GST cares about. */
export async function loadGstBooks(profile: GstProfile, from: Date, to: Date): Promise<GstBooks> {
  const workspaceId = profile.workspaceId;
  const [invoiceRows, noteRows, expenseRows, adjustmentRows, debitRows, amendmentRows, advanceRows] = await Promise.all([
    prisma.invoice.findMany({ where: { workspaceId, invoiceDate: { gte: from, lte: to } }, select: invoiceSelect, orderBy: { invoiceDate: "asc" } }),
    prisma.creditNote.findMany({
      where: { workspaceId, issuedAt: { gte: from, lte: to } },
      select: { id: true, creditNoteNumber: true, issuedAt: true, amount: true, taxAmount: true, reason: true, invoice: { select: invoiceSelect } },
      orderBy: { issuedAt: "asc" },
    }),
    // Bills are loaded from 200 days before the window so rule 37 (180-day payment) can see the ones that lapse inside it.
    prisma.expense.findMany({
      where: { workspaceId, date: { gte: new Date(from.getTime() - 200 * 86400000), lte: to }, itcStatus: { not: "NONE" } },
      orderBy: { date: "asc" },
    }),
    prisma.gstAdjustment.findMany({ where: { workspaceId, periodKey: { gte: monthKeyOf(from), lte: monthKeyOf(to) } } }),
    prisma.gstDebitNote.findMany({ where: { workspaceId, issuedAt: { gte: from, lte: to } }, orderBy: { issuedAt: "asc" } }),
    prisma.gstAmendment.findMany({ where: { workspaceId } }),
    prisma.gstAdvance.findMany({ where: { workspaceId, OR: [{ receivedAt: { gte: from, lte: to } }, { adjustedAt: { gte: from, lte: to } }] } }),
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
    paymentStatus: e.paymentStatus,
    paidAt: e.paidAt,
    itcHeld: e.itcHeld,
    itcClaimMonth: e.itcClaimMonth,
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
  const debitNotes: DebitNoteInput[] = debitRows.map((d) => ({
    id: d.id, number: d.noteNumber, date: d.issuedAt, invoiceNumber: d.invoiceNumber, invoiceDate: d.invoiceDate, name: d.recipientName,
    gstin: d.recipientGstin ? normalizeGstin(d.recipientGstin) : null, pos: d.pos, rate: d.rate,
    taxable: num(d.taxable), igst: num(d.igst), cgst: num(d.cgst), sgst: num(d.sgst), cess: num(d.cess), reason: d.reason,
  }));
  const amendments: AmendmentInput[] = amendmentRows.map((a) => ({
    id: a.id, periodKey: a.periodKey, originalPeriodKey: a.originalPeriodKey, originalNumber: a.originalNumber, originalDate: a.originalDate,
    name: a.recipientName, gstin: a.recipientGstin ? normalizeGstin(a.recipientGstin) : null, pos: a.pos, rate: a.rate, reason: a.reason,
    original: { taxable: num(a.originalTaxable), igst: num(a.originalIgst), cgst: num(a.originalCgst), sgst: num(a.originalSgst), cess: 0 },
    revised: { taxable: num(a.revisedTaxable), igst: num(a.revisedIgst), cgst: num(a.revisedCgst), sgst: num(a.revisedSgst), cess: 0 },
  }));
  const advances: AdvanceInput[] = advanceRows.map((a) => ({
    id: a.id, receivedAt: a.receivedAt, adjustedAt: a.adjustedAt, party: a.party, gstin: a.recipientGstin ? normalizeGstin(a.recipientGstin) : null,
    pos: a.pos, rate: a.rate, taxable: num(a.taxable), igst: num(a.igst), cgst: num(a.cgst), sgst: num(a.sgst), adjustedInvoice: a.adjustedInvoice,
  }));
  return { invoices, creditNotes, expenses, adjustments, debitNotes, amendments, advances };
}

export const inMonthRange = (d: Date, start: Date, end: Date) => d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
export { monthKeyOf };
