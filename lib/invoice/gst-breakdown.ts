import { r2, splitIntra } from "@/lib/gst/money";
import { FOREIGN_POS, stateName } from "@/lib/gst/states";

export type GstInput = {
  supplierStateCode?: string | null;
  placeOfSupply?: string | null;
  reverseCharge?: boolean;
  supplyOverride?: string | null;
  irn?: string | null;
  irnAckNo?: string | null;
  irnAckDate?: Date | null;
};

export type GstRateRow = {
  ratePercent: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

export type GstBreakdown = {
  kind: "INTRA" | "INTER" | "EXPORT" | "NONE";
  placeOfSupplyCode: string | null;
  placeOfSupplyName: string | null;
  /** One row per tax rate. For kind NONE the rows carry `total` only (no head split). Empty for exports. */
  rows: GstRateRow[];
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  reverseCharge: boolean;
  supplyOverride: string | null;
  irn: string | null;
  irnAckNo: string | null;
  irnAckDate: Date | null;
};

type BreakdownArgs = {
  lines: Array<{ amount: number; taxRate: number }>;
  gst?: GstInput;
  isExport: boolean;
  isTaxExempt: boolean;
  /** The invoice's own rounded tax (`totals.taxAmount`); the rows always add up to exactly this. */
  totalTaxAmount: number;
};

const isSez = (override: string | null | undefined) => typeof override === "string" && override.startsWith("SEZ");

export const buildGstBreakdown = ({ lines, gst, isExport, isTaxExempt, totalTaxAmount }: BreakdownArgs): GstBreakdown => {
  const pos = gst?.placeOfSupply?.trim() || null;
  const supplier = gst?.supplierStateCode?.trim() || null;
  const base = {
    placeOfSupplyCode: pos,
    placeOfSupplyName: pos ? stateName(pos) : null,
    reverseCharge: Boolean(gst?.reverseCharge),
    supplyOverride: gst?.supplyOverride ?? null,
    irn: gst?.irn ?? null,
    irnAckNo: gst?.irnAckNo ?? null,
    irnAckDate: gst?.irnAckDate ?? null,
  };
  const empty = { rows: [] as GstRateRow[], cgst: 0, sgst: 0, igst: 0, totalTax: 0 };

  if (isExport || pos === FOREIGN_POS) return { kind: "EXPORT", ...base, ...empty };
  if (isTaxExempt || !gst || lines.length === 0) return { kind: "NONE", ...base, ...empty };

  const byRate = new Map<number, number>();
  for (const line of lines) {
    const ratePercent = Math.round(line.taxRate * 10_000) / 100;
    byRate.set(ratePercent, r2((byRate.get(ratePercent) ?? 0) + line.amount));
  }
  const rates = [...byRate.keys()].sort((a, b) => a - b);
  const totals = rates.map((ratePercent) => r2((byRate.get(ratePercent) ?? 0) * (ratePercent / 100)));
  // Rounding per row can drift from the invoice's tax by a few paise; the highest-rate row absorbs it.
  const drift = r2(totalTaxAmount - totals.reduce((sum, t) => r2(sum + t), 0));
  if (totals.length > 0) totals[totals.length - 1] = r2(totals[totals.length - 1] + drift);

  const kind: GstBreakdown["kind"] =
    !supplier || !pos ? "NONE" : isSez(gst.supplyOverride) || supplier !== pos ? "INTER" : "INTRA";

  const rows: GstRateRow[] = rates.map((ratePercent, index) => {
    const total = totals[index];
    const taxable = byRate.get(ratePercent) ?? 0;
    if (kind === "INTRA") {
      const { cgst, sgst } = splitIntra(total);
      return { ratePercent, taxable, cgst, sgst, igst: 0, total };
    }
    if (kind === "INTER") return { ratePercent, taxable, cgst: 0, sgst: 0, igst: total, total };
    return { ratePercent, taxable, cgst: 0, sgst: 0, igst: 0, total };
  });

  return {
    kind,
    ...base,
    rows,
    cgst: r2(rows.reduce((s, r) => s + r.cgst, 0)),
    sgst: r2(rows.reduce((s, r) => s + r.sgst, 0)),
    igst: r2(rows.reduce((s, r) => s + r.igst, 0)),
    totalTax: r2(totalTaxAmount),
  };
};
