import "server-only";
import { prisma } from "@/lib/prisma";
import { loadGstBooks, loadGstProfile } from "@/lib/gst/data";
import { num, r2 } from "@/lib/gst/money";
import { stateName } from "@/lib/gst/states";
import { fyBounds, fyLabel } from "./fy";
import type { CaOverview } from "./data";

type Row = Array<string | number | null>;

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/** Sales register: every non-void invoice in the year as GST sees it (INR, taxable value and the tax split). */
export async function salesRegister(workspaceId: string, startYear: number): Promise<Row[]> {
  const { start, end } = fyBounds(startYear);
  const profile = await loadGstProfile(workspaceId);
  const books = await loadGstBooks(profile, start, end);
  const out: Row[] = [["Date", "Invoice no.", "Customer", "GSTIN", "Place of supply", "Supply type", "HSN/SAC", "Taxable value (INR)", "CGST", "SGST", "IGST", "Cess", "Invoice value (INR)", "IRN", "Issues"]];
  for (const i of books.invoices.filter((x) => !x.voided)) {
    const sum = (k: "cgst" | "sgst" | "igst" | "cess") => r2(i.lines.reduce((s, l) => s + l[k], 0));
    out.push([ymd(i.date), i.number, i.clientName, i.gstin ?? "", `${i.placeOfSupply} ${stateName(i.placeOfSupply)}`.trim(), i.supplyType, Array.from(new Set(i.lines.map((l) => l.hsn).filter(Boolean))).join(" "), i.taxable, sum("cgst"), sum("sgst"), sum("igst"), sum("cess"), i.value, i.irn ?? "", i.issues.join(" ")]);
  }
  return out;
}

export async function purchaseRegister(workspaceId: string, startYear: number): Promise<Row[]> {
  const { start, end } = fyBounds(startYear);
  const rows = await prisma.expense.findMany({ where: { workspaceId, approvalStatus: "APPROVED", date: { gte: start, lte: end } }, orderBy: { date: "asc" } });
  const out: Row[] = [["Date", "Vendor", "Vendor GSTIN", "Vendor invoice no.", "Category", "HSN", "GST rate %", "Amount", "CGST", "SGST", "IGST", "Cess", "ITC status", "Payment status", "Receipt on file"]];
  for (const e of rows) out.push([ymd(e.date), e.vendor, e.vendorGstin ?? "", e.vendorInvoiceNo ?? "", e.category, e.hsnCode ?? "", e.gstRate ?? "", num(e.amount), num(e.cgstAmount), num(e.sgstAmount), num(e.igstAmount), num(e.cessAmount), e.itcStatus, e.paymentStatus ?? "", e.receiptUrl ? "Yes" : "No"]);
  return out;
}

export async function tdsRegister(workspaceId: string, startYear: number): Promise<Row[]> {
  const { start, end } = fyBounds(startYear);
  const rows = await prisma.withholdingEvent.findMany({ where: { workspaceId, deductedAt: { gte: start, lte: end } }, orderBy: { deductedAt: "asc" } });
  const out: Row[] = [["Date", "Direction", "Party", "Section", "Gross", "Rate %", "Tax withheld", "Deposit due", "Deposited on", "Return period"]];
  for (const w of rows) out.push([ymd(w.deductedAt), w.sourceType === "INVOICE_PAYMENT" ? "Withheld by customer (credit)" : "Deducted by you", w.counterpartyName ?? "", w.sectionCode ?? "", num(w.grossAmount), w.withholdingRatePercent === null ? "" : num(w.withholdingRatePercent), num(w.withheldAmount), ymd(w.depositDueAt), ymd(w.depositedAt), w.returnPeriodKey ?? ""]);
  return out;
}

export function calendarRegister(o: CaOverview): Row[] {
  const out: Row[] = [["Group", "Obligation", "Period", "Due date", "Status", "Filed on", "Reference", "Signed off by", "Signed off on", "Notes"]];
  for (const i of o.items) out.push([i.group, i.label ?? i.kind, i.periodKey, i.effectiveDue.slice(0, 10), i.state, i.filedAt?.slice(0, 10) ?? "", i.reference ?? "", i.signedOffBy ?? "", i.signedOffAt?.slice(0, 10) ?? "", i.notes ?? ""]);
  return out;
}

export function summaryRegister(o: CaOverview): Row[] {
  const f = o.figures;
  const rows: Row[] = [
    ["Financial year", fyLabel(o.fyStart)],
    ["Invoiced, GST excluded", f.billed],
    ["Received in the year, GST excluded", f.received],
    ["Expenses, claimed GST excluded", f.expenses],
    ["Posted payroll cost", f.payroll],
    ["Input tax credit claimed", f.itcClaimed],
    ["Tax withheld by customers (credit)", f.tdsCredits],
    ["Tax deducted by you", f.tdsDeducted],
    ["Of which deposited", f.tdsDeposited],
    ["Invoices", f.invoiceCount],
  ];
  if (o.estimate) rows.push(["Estimated taxable income", o.estimate.taxableIncome], ["Estimated income tax", o.estimate.tax], ["Estimated tax payable after credits", o.estimate.payable], ["Estimate basis", o.estimate.basis]);
  rows.push(["Blockers to closing the books", o.readiness.blockers], ["Warnings", o.readiness.warnings]);
  return [["Item", "Value"], ...rows];
}
