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

export type ReconStatus = "MATCHED" | "LIKELY" | "MISMATCH" | "MISSING_IN_BOOKS" | "MISSING_IN_2B";

export type ReconRow = {
  status: ReconStatus;
  supplierGstin: string;
  supplierName: string;
  invoiceNumber: string;
  date: string | null;
  twoB: { taxable: number; tax: number; igst: number; cgst: number; sgst: number; cess: number } | null;
  books: { taxable: number; tax: number; expenseId: string } | null;
  taxDifference: number;
  itcAvailable: boolean;
  /** Invoice number as recorded in the books when it differs from the 2B (likely matches). */
  bookInvoiceNumber?: string;
  held?: boolean;
};

const taxOf = (x: { igst: number; cgst: number; sgst: number; cess: number }) => r2(x.igst + x.cgst + x.sgst + x.cess);

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Invoice numbers that probably denote the same document: a prefix or year was dropped/added, or one character differs. */
export function similarInvoiceNumbers(a: string, b: string): boolean {
  const x = normInvoice(a);
  const y = normInvoice(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 3 && long.endsWith(short)) return true;
  return Math.min(x.length, y.length) >= 6 && levenshtein(x, y) <= 1;
}

export type ReconOptions = { tolerance?: number };

/**
 * Match 2B rows with purchase bills. Pass 1: supplier GSTIN + normalised invoice number. Pass 2 ("likely"): same supplier,
 * a similar invoice number and tax within tolerance, so typos and missing prefixes are surfaced for one-click confirmation
 * instead of showing up as two unrelated gaps. Amounts tolerate `tolerance` (default Rs 1) of rounding.
 */
export function reconcileGstr2b(twoB: Gstr2bRow[], expenses: ExpenseGstInput[], opts: ReconOptions = {}): { rows: ReconRow[]; counts: Record<ReconStatus, number>; unmatchedTax: number } {
  const tol = opts.tolerance ?? 1;
  const key = (g: string, n: string) => `${normalizeGstin(g)}|${normInvoice(n)}`;
  const claimable = expenses.filter((e) => e.itcStatus !== "NONE" && !!e.vendorGstin && !!e.vendorInvoiceNo);
  const bookMap = new Map<string, ExpenseGstInput>();
  for (const e of claimable) bookMap.set(key(e.vendorGstin!, e.vendorInvoiceNo!), e);

  const rows: ReconRow[] = [];
  const used = new Set<string>();
  const unmatched2b: Gstr2bRow[] = [];
  const row = (r: Gstr2bRow, book: ExpenseGstInput | null, status: ReconStatus, extra: Partial<ReconRow> = {}): ReconRow => {
    const twoBTax = taxOf(r);
    const bookTax = book ? taxOf(book) : 0;
    return {
      status, supplierGstin: r.supplierGstin, supplierName: r.supplierName ?? book?.vendor ?? "", invoiceNumber: r.invoiceNumber, date: r.invoiceDate?.toISOString().slice(0, 10) ?? null,
      twoB: { taxable: r.taxableValue, tax: twoBTax, igst: r.igst, cgst: r.cgst, sgst: r.sgst, cess: r.cess }, books: book ? { taxable: r2(book.amount - bookTax), tax: bookTax, expenseId: book.id } : null,
      taxDifference: r2(twoBTax - bookTax), itcAvailable: r.itcAvailable, held: book?.itcHeld ?? false, ...extra,
    };
  };

  for (const r of twoB) {
    const k = key(r.supplierGstin, r.invoiceNumber);
    const book = bookMap.get(k);
    if (!book || used.has(k)) { unmatched2b.push(r); continue; }
    used.add(k);
    rows.push(row(r, book, Math.abs(r2(taxOf(r) - taxOf(book))) <= tol ? "MATCHED" : "MISMATCH"));
  }

  const remaining = claimable.filter((e) => !used.has(key(e.vendorGstin!, e.vendorInvoiceNo!)));
  for (const r of unmatched2b) {
    const cand = remaining.find((e) => !used.has(key(e.vendorGstin!, e.vendorInvoiceNo!)) && normalizeGstin(e.vendorGstin) === normalizeGstin(r.supplierGstin)
      && (similarInvoiceNumbers(e.vendorInvoiceNo!, r.invoiceNumber) || Math.abs(r2(taxOf(e) - taxOf(r))) <= tol) && Math.abs(r2(taxOf(e) - taxOf(r))) <= Math.max(tol, taxOf(r) * 0.02));
    if (cand) {
      used.add(key(cand.vendorGstin!, cand.vendorInvoiceNo!));
      rows.push(row(r, cand, "LIKELY", { bookInvoiceNumber: cand.vendorInvoiceNo ?? undefined }));
    } else {
      rows.push(row(r, null, "MISSING_IN_BOOKS"));
    }
  }
  for (const e of claimable) {
    if (used.has(key(e.vendorGstin!, e.vendorInvoiceNo!))) continue;
    const bookTax = taxOf(e);
    rows.push({ status: "MISSING_IN_2B", supplierGstin: e.vendorGstin ?? "", supplierName: e.vendor, invoiceNumber: e.vendorInvoiceNo ?? "", date: e.date.toISOString().slice(0, 10), twoB: null, books: { taxable: r2(e.amount - bookTax), tax: bookTax, expenseId: e.id }, taxDifference: -bookTax, itcAvailable: e.itcStatus === "ELIGIBLE", held: e.itcHeld ?? false });
  }

  const counts: Record<ReconStatus, number> = { MATCHED: 0, LIKELY: 0, MISMATCH: 0, MISSING_IN_BOOKS: 0, MISSING_IN_2B: 0 };
  for (const r of rows) counts[r.status] += 1;
  const unmatchedTax = r2(rows.filter((r) => r.status !== "MATCHED" && r.status !== "LIKELY").reduce((s, r) => s + Math.abs(r.taxDifference), 0));
  const order: Record<ReconStatus, number> = { MISMATCH: 0, MISSING_IN_2B: 1, LIKELY: 2, MISSING_IN_BOOKS: 3, MATCHED: 4 };
  rows.sort((a, b) => order[a.status] - order[b.status]);
  return { rows, counts, unmatchedTax };
}
