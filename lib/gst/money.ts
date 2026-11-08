export type TaxHeads = { igst: number; cgst: number; sgst: number; cess: number };
export type TaxRow = TaxHeads & { taxable: number };

export const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const zeroHeads = (): TaxHeads => ({ igst: 0, cgst: 0, sgst: 0, cess: 0 });
export const zeroRow = (): TaxRow => ({ taxable: 0, ...zeroHeads() });

export function addRow(a: TaxRow, b: Partial<TaxRow>): TaxRow {
  return {
    taxable: r2(a.taxable + (b.taxable ?? 0)),
    igst: r2(a.igst + (b.igst ?? 0)),
    cgst: r2(a.cgst + (b.cgst ?? 0)),
    sgst: r2(a.sgst + (b.sgst ?? 0)),
    cess: r2(a.cess + (b.cess ?? 0)),
  };
}

export function addHeads(a: TaxHeads, b: Partial<TaxHeads>): TaxHeads {
  return {
    igst: r2(a.igst + (b.igst ?? 0)),
    cgst: r2(a.cgst + (b.cgst ?? 0)),
    sgst: r2(a.sgst + (b.sgst ?? 0)),
    cess: r2(a.cess + (b.cess ?? 0)),
  };
}

export const totalTax = (h: TaxHeads): number => r2(h.igst + h.cgst + h.sgst + h.cess);

export function negate(row: TaxRow): TaxRow {
  return { taxable: -row.taxable, igst: -row.igst, cgst: -row.cgst, sgst: -row.sgst, cess: -row.cess };
}

/** Split a tax amount into CGST + SGST halves that always add back to the total. */
export function splitIntra(tax: number): { cgst: number; sgst: number } {
  const cgst = r2(tax / 2);
  return { cgst, sgst: r2(tax - cgst) };
}

export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(n) ? n : 0;
}
