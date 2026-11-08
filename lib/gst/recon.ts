import { r2, num } from "./money";
import { normalizeGstin } from "./gstin";
import type { ExpenseGstInput } from "./books";

export type Gstr2bRow = {
  supplierGstin: string;
  supplierName: string | null;
  invoiceNumber: string;
  invoiceDate: Date | null;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  itcAvailable: boolean;
  reverseCharge: boolean;
};

export type ParseResult = { rows: Gstr2bRow[]; skipped: number; periodHint: string | null };

const normInvoice = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");

function parsePortalDate(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

type PortalInvoice = { inum?: string; dt?: string; txval?: number; igst?: number; cgst?: number; sgst?: number; cess?: number; itcavl?: string; rev?: string };
type PortalSupplier = { ctin?: string; trdnm?: string; inv?: PortalInvoice[] };

/** Parse a GSTR-2B JSON downloaded from the GST portal (b2b section; credit notes arrive negated). */
export function parseGstr2bJson(json: unknown): ParseResult {
  const root = (json ?? {}) as { data?: { rtnprd?: string; docdata?: { b2b?: PortalSupplier[]; cdnr?: Array<{ ctin?: string; trdnm?: string; nt?: Array<PortalInvoice & { ntnum?: string; ntty?: string }> }> } } };
  const doc = root.data?.docdata;
  const rows: Gstr2bRow[] = [];
  let skipped = 0;
  for (const s of doc?.b2b ?? []) {
    for (const inv of s.inv ?? []) {
      const gstin = normalizeGstin(s.ctin);
      if (!gstin || !inv.inum) { skipped += 1; continue; }
      rows.push({
        supplierGstin: gstin,
        supplierName: s.trdnm ?? null,
        invoiceNumber: inv.inum,
        invoiceDate: parsePortalDate(inv.dt),
        taxableValue: num(inv.txval),
        igst: num(inv.igst), cgst: num(inv.cgst), sgst: num(inv.sgst), cess: num(inv.cess),
        itcAvailable: (inv.itcavl ?? "Y") === "Y",
        reverseCharge: inv.rev === "Y",
      });
    }
  }
  for (const s of doc?.cdnr ?? []) {
    for (const nt of s.nt ?? []) {
      const gstin = normalizeGstin(s.ctin);
      const number = nt.ntnum ?? nt.inum;
      if (!gstin || !number) { skipped += 1; continue; }
      rows.push({
        supplierGstin: gstin,
        supplierName: s.trdnm ?? null,
        invoiceNumber: number,
        invoiceDate: parsePortalDate(nt.dt),
        taxableValue: -num(nt.txval),
        igst: -num(nt.igst), cgst: -num(nt.cgst), sgst: -num(nt.sgst), cess: -num(nt.cess),
        itcAvailable: (nt.itcavl ?? "Y") === "Y",
        reverseCharge: false,
      });
    }
  }
  const rt = root.data?.rtnprd;
  const periodHint = rt && /^\d{6}$/.test(rt) ? `${rt.slice(2)}-${rt.slice(0, 2)}` : null;
  return { rows, skipped, periodHint };
}

/** CSV: gstin,invoice_number,invoice_date,taxable_value,igst,cgst,sgst,cess[,supplier_name] with a header row. */
export function parseGstr2bCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: Gstr2bRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const c = line.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
    const gstin = normalizeGstin(c[0]);
    if (!gstin || !c[1]) { skipped += 1; continue; }
    rows.push({
      supplierGstin: gstin,
      supplierName: c[8] || null,
      invoiceNumber: c[1],
      invoiceDate: parsePortalDate(c[2]),
      taxableValue: num(c[3]), igst: num(c[4]), cgst: num(c[5]), sgst: num(c[6]), cess: num(c[7]),
      itcAvailable: true,
      reverseCharge: false,
    });
  }
  return { rows, skipped, periodHint: null };
}

export type ReconStatus = "MATCHED" | "MISMATCH" | "MISSING_IN_BOOKS" | "MISSING_IN_2B";

export type ReconRow = {
  status: ReconStatus;
  supplierGstin: string;
  supplierName: string;
  invoiceNumber: string;
  date: string | null;
  twoB: { taxable: number; tax: number } | null;
  books: { taxable: number; tax: number; expenseId: string } | null;
  taxDifference: number;
  itcAvailable: boolean;
};

const taxOf = (x: { igst: number; cgst: number; sgst: number; cess: number }) => r2(x.igst + x.cgst + x.sgst + x.cess);

/** Match 2B rows with purchase bills on supplier GSTIN + normalised invoice number; amounts tolerate Rs 1 of rounding. */
export function reconcileGstr2b(twoB: Gstr2bRow[], expenses: ExpenseGstInput[]): { rows: ReconRow[]; counts: Record<ReconStatus, number>; unmatchedTax: number } {
  const key = (g: string, n: string) => `${normalizeGstin(g)}|${normInvoice(n)}`;
  const bookMap = new Map<string, ExpenseGstInput>();
  for (const e of expenses) {
    if (e.itcStatus === "NONE" || !e.vendorGstin || !e.vendorInvoiceNo) continue;
    bookMap.set(key(e.vendorGstin, e.vendorInvoiceNo), e);
  }
  const rows: ReconRow[] = [];
  const used = new Set<string>();
  for (const r of twoB) {
    const k = key(r.supplierGstin, r.invoiceNumber);
    const book = bookMap.get(k);
    const twoBTax = taxOf(r);
    if (!book) {
      rows.push({ status: "MISSING_IN_BOOKS", supplierGstin: r.supplierGstin, supplierName: r.supplierName ?? "", invoiceNumber: r.invoiceNumber, date: r.invoiceDate?.toISOString().slice(0, 10) ?? null, twoB: { taxable: r.taxableValue, tax: twoBTax }, books: null, taxDifference: twoBTax, itcAvailable: r.itcAvailable });
      continue;
    }
    used.add(k);
    const bookTax = taxOf(book);
    const diff = r2(twoBTax - bookTax);
    rows.push({
      status: Math.abs(diff) <= 1 ? "MATCHED" : "MISMATCH",
      supplierGstin: r.supplierGstin,
      supplierName: r.supplierName ?? book.vendor,
      invoiceNumber: r.invoiceNumber,
      date: r.invoiceDate?.toISOString().slice(0, 10) ?? null,
      twoB: { taxable: r.taxableValue, tax: twoBTax },
      books: { taxable: r2(book.amount - bookTax), tax: bookTax, expenseId: book.id },
      taxDifference: diff,
      itcAvailable: r.itcAvailable,
    });
  }
  for (const [k, e] of bookMap) {
    if (used.has(k)) continue;
    const bookTax = taxOf(e);
    rows.push({ status: "MISSING_IN_2B", supplierGstin: e.vendorGstin ?? "", supplierName: e.vendor, invoiceNumber: e.vendorInvoiceNo ?? "", date: e.date.toISOString().slice(0, 10), twoB: null, books: { taxable: r2(e.amount - bookTax), tax: bookTax, expenseId: e.id }, taxDifference: -bookTax, itcAvailable: e.itcStatus === "ELIGIBLE" });
  }
  const counts: Record<ReconStatus, number> = { MATCHED: 0, MISMATCH: 0, MISSING_IN_BOOKS: 0, MISSING_IN_2B: 0 };
  for (const r of rows) counts[r.status] += 1;
  const unmatchedTax = r2(rows.filter((r) => r.status !== "MATCHED").reduce((s, r) => s + Math.abs(r.taxDifference), 0));
  const order: Record<ReconStatus, number> = { MISMATCH: 0, MISSING_IN_2B: 1, MISSING_IN_BOOKS: 2, MATCHED: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status]);
  return { rows, counts, unmatchedTax };
}
