import { MSME_RULES } from "./rules";

export type SupplyKind = "SERVICES" | "GOODS" | "BOTH";

export type ThresholdStatus =
  | "NOT_APPLICABLE" // not an Indian workspace
  | "REGISTERED" // already registered (regular or composition)
  | "WELL_BELOW" // under 80% of the limit
  | "APPROACHING" // 80-100%
  | "CROSSED"; // over the limit and still unregistered

export type ThresholdView = {
  status: ThresholdStatus;
  limit: number;
  turnover: number;
  /** 0-1+, share of the limit used. */
  share: number;
  headroom: number;
  specialCategory: boolean;
  /** First invoice date on which the running total went over the limit. */
  crossedOn: string | null;
  /** Last date to apply (crossing date + 30 days). */
  applyBy: string | null;
  /** Projected crossing date from the year's run rate, if turnover is still under the limit. */
  projectedCrossing: string | null;
};

/** Applicable limit. Goods-only suppliers get the goods limit; anyone selling services (alone or mixed) gets the services limit. */
export function thresholdLimit(kind: SupplyKind, stateCode: string | null): { limit: number; special: boolean } {
  const special = !!stateCode && (MSME_RULES.gst.specialStateCodes as readonly string[]).includes(stateCode);
  const g = MSME_RULES.gst;
  if (kind === "GOODS") return { limit: special ? g.goodsSpecial : g.goods, special };
  return { limit: special ? g.servicesSpecial : g.services, special };
}

export type TurnoverPoint = { date: Date; amount: number };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/**
 * Where a business stands against the GST registration limit for one financial year.
 * Aggregate turnover is the taxable, exempt and export value of outward supplies, excluding GST itself, so callers pass GST-exclusive amounts.
 * `fyStart` is 1 April; points must belong to that year. `now` bounds the run-rate projection.
 */
export function gstThresholdView(args: {
  registered: boolean;
  countryIsIndia: boolean;
  kind: SupplyKind;
  stateCode: string | null;
  points: TurnoverPoint[];
  fyStart: Date;
  now: Date;
}): ThresholdView {
  const { limit, special } = thresholdLimit(args.kind, args.stateCode);
  const sorted = [...args.points].filter((p) => p.amount > 0).sort((a, b) => a.date.getTime() - b.date.getTime());
  const turnover = Math.round(sorted.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const share = limit > 0 ? turnover / limit : 0;
  const base: ThresholdView = { status: "WELL_BELOW", limit, turnover, share, headroom: Math.max(0, limit - turnover), specialCategory: special, crossedOn: null, applyBy: null, projectedCrossing: null };
  if (!args.countryIsIndia) return { ...base, status: "NOT_APPLICABLE" };
  if (args.registered) return { ...base, status: "REGISTERED" };

  let running = 0;
  for (const p of sorted) {
    running += p.amount;
    if (running > limit) {
      base.crossedOn = iso(p.date);
      base.applyBy = iso(addDays(p.date, MSME_RULES.gst.applyWithinDays));
      break;
    }
  }
  if (base.crossedOn) return { ...base, status: "CROSSED" };
  if (share >= MSME_RULES.gst.warnShare) base.status = "APPROACHING";

  const elapsedDays = Math.max(30, (args.now.getTime() - args.fyStart.getTime()) / 86_400_000);
  if (turnover > 0) {
    const perDay = turnover / elapsedDays;
    const days = (limit - turnover) / perDay;
    const when = addDays(args.now, Math.ceil(days));
    // Only worth showing if it lands inside the same year.
    if (days >= 0 && when.getTime() < addDays(args.fyStart, 366).getTime()) base.projectedCrossing = iso(when);
  }
  return base;
}

export type CompositionView = { eligible: boolean; reason: "OK" | "OVER_LIMIT" | "NOT_APPLICABLE"; limit: number; rate: number };

/** Composition is an option, not an obligation: it needs registration, intra-state supplies only, and turnover within the limit. */
export function compositionView(args: { kind: SupplyKind; stateCode: string | null; prevTurnover: number }): CompositionView {
  const c = MSME_RULES.composition;
  if (args.kind === "BOTH") return { eligible: false, reason: "NOT_APPLICABLE", limit: c.services.limit, rate: c.services.rate };
  if (args.kind === "SERVICES") return { eligible: args.prevTurnover <= c.services.limit, reason: args.prevTurnover <= c.services.limit ? "OK" : "OVER_LIMIT", limit: c.services.limit, rate: c.services.rate };
  const { special } = thresholdLimit("GOODS", args.stateCode);
  const limit = special ? c.goods.limitSpecial : c.goods.limit;
  return { eligible: args.prevTurnover <= limit, reason: args.prevTurnover <= limit ? "OK" : "OVER_LIMIT", limit, rate: c.goods.rate };
}

/** Does this supplier charge GST on invoices? Only registered Indian businesses on the regular scheme do. Composition dealers may not collect tax. */
export function supplierChargesGst(profile: { gstRegistrationType?: string | null } | null | undefined, countryCode: string | null | undefined): boolean {
  if ((countryCode ?? "IN").toUpperCase() !== "IN") return true;
  const t = profile?.gstRegistrationType ?? "REGULAR";
  return t !== "UNREGISTERED" && t !== "COMPOSITION";
}

/** Document title and note for supplies where no GST is charged, or null when a normal tax invoice applies. */
export function nonGstDocument(profile: { gstRegistrationType?: string | null } | null | undefined, countryCode: string | null | undefined): { title: string; note: string } | null {
  if ((countryCode ?? "IN").toUpperCase() !== "IN") return null;
  if (profile?.gstRegistrationType === "UNREGISTERED") return { title: "INVOICE", note: "SUPPLIER NOT REGISTERED UNDER GST" };
  if (profile?.gstRegistrationType === "COMPOSITION") return { title: "BILL OF SUPPLY", note: "COMPOSITION TAXABLE PERSON, NOT ELIGIBLE TO COLLECT TAX ON SUPPLIES" };
  return null;
}
