/** Pure stock rules. No database or framework imports. */

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export const stockStatus = (stock: number, safetyStock: number): StockStatus =>
  stock <= 0 ? 'OUT_OF_STOCK' : stock <= safetyStock ? 'LOW_STOCK' : 'IN_STOCK';

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;

/**
 * Cost per unit after goods arrive: the old stock at its old cost plus the new goods at theirs, averaged.
 * With nothing (or less than nothing) on hand, the new cost simply replaces the old one.
 */
export function weightedAverageCost(args: { stock: number; cost: number; qty: number; unitCost: number }): number {
  const { stock, cost, qty, unitCost } = args;
  if (!(qty > 0)) return r4(cost);
  if (stock <= 0) return r4(unitCost);
  return r4((stock * cost + qty * unitCost) / (stock + qty));
}

export type StockProduct = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  category: string | null;
  currentStock: number;
  safetyStock: number;
  costPrice: number;
  baselinePrice: number;
  reorderQuantity: number | null;
  leadTimeDays: number | null;
  preferredVendorId: string | null;
  createdAt: Date;
};

export function summarizeStock(products: StockProduct[]) {
  let stockValue = 0;
  let retailValue = 0;
  let units = 0;
  let low = 0;
  let out = 0;
  let negative = 0;
  for (const p of products) {
    const qty = Math.max(0, p.currentStock);
    units += qty;
    stockValue += qty * p.costPrice;
    retailValue += qty * p.baselinePrice;
    const s = stockStatus(p.currentStock, p.safetyStock);
    if (s === 'LOW_STOCK') low += 1;
    if (s === 'OUT_OF_STOCK') out += 1;
    if (p.currentStock < 0) negative += 1;
  }
  return {
    products: products.length,
    units,
    stockValue: r2(stockValue),
    retailValue: r2(retailValue),
    potentialMargin: r2(retailValue - stockValue),
    marginPct: retailValue > 0 ? r2(((retailValue - stockValue) / retailValue) * 100) : 0,
    lowStock: low,
    outOfStock: out,
    negativeStock: negative,
  };
}

export type ReorderSuggestion = {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  currentStock: number;
  onOrder: number;
  dailyDemand: number;
  /** Days the stock on hand and on order will last at the recent selling rate; null when nothing sells. */
  daysOfCover: number | null;
  suggestedQty: number;
  estimatedCost: number;
  urgency: 'NOW' | 'SOON';
  reason: 'OUT_OF_STOCK' | 'BELOW_SAFETY' | 'LOW_COVER';
  preferredVendorId: string | null;
};

const DEFAULT_LEAD_DAYS = 14;
/** How many days of selling to hold on top of the lead time. */
const COVER_BUFFER_DAYS = 30;

/**
 * What to reorder, from what actually sells. Demand is the last 30 days (or the last 90 when nothing sold
 * recently). Anything on order already counts towards what is available, so the same gap is not ordered twice.
 */
export function reorderSuggestions(args: {
  products: StockProduct[];
  sold: Map<string, { last30: number; last90: number }>;
  onOrder: Map<string, number>;
}): ReorderSuggestion[] {
  const out: ReorderSuggestion[] = [];
  for (const p of args.products) {
    const s = args.sold.get(p.id) ?? { last30: 0, last90: 0 };
    const dailyDemand = s.last30 > 0 ? s.last30 / 30 : s.last90 / 90;
    const incoming = args.onOrder.get(p.id) ?? 0;
    const available = p.currentStock + incoming;
    const lead = p.leadTimeDays ?? DEFAULT_LEAD_DAYS;
    const cover = dailyDemand > 0 ? available / dailyDemand : null;

    const reason: ReorderSuggestion['reason'] | null =
      p.currentStock <= 0 && available <= 0 ? 'OUT_OF_STOCK' : available <= p.safetyStock ? 'BELOW_SAFETY' : cover !== null && cover < lead + 7 ? 'LOW_COVER' : null;
    if (!reason) continue;
    if (reason === 'OUT_OF_STOCK' && dailyDemand === 0 && p.safetyStock === 0 && !p.reorderQuantity) continue;

    const need = dailyDemand * (lead + COVER_BUFFER_DAYS) - available;
    let qty = Math.ceil(Math.max(0, need));
    const step = p.reorderQuantity && p.reorderQuantity > 0 ? p.reorderQuantity : null;
    if (step) qty = Math.max(step, Math.ceil(qty / step) * step);
    if (qty <= 0) qty = Math.max(1, p.safetyStock * 2 - available);

    const stockoutSoon = p.currentStock <= 0 || (dailyDemand > 0 && p.currentStock / dailyDemand < lead);
    out.push({
      productId: p.id, name: p.name, sku: p.sku, unit: p.unit, currentStock: p.currentStock, onOrder: incoming,
      dailyDemand: r2(dailyDemand), daysOfCover: cover === null ? null : Math.round(cover), suggestedQty: qty, estimatedCost: r2(qty * p.costPrice),
      urgency: stockoutSoon ? 'NOW' : 'SOON', reason, preferredVendorId: p.preferredVendorId,
    });
  }
  return out.sort((a, b) => (a.urgency === b.urgency ? b.estimatedCost - a.estimatedCost : a.urgency === 'NOW' ? -1 : 1));
}

/** Stock that has sat untouched: on hand, older than `days`, and nothing sold in that time. */
export function deadStock(args: { products: StockProduct[]; lastSold: Map<string, Date>; now: Date; days?: number }) {
  const days = args.days ?? 90;
  const cutoff = args.now.getTime() - days * 86_400_000;
  const items = args.products
    .filter((p) => p.currentStock > 0 && p.createdAt.getTime() < cutoff && !((args.lastSold.get(p.id)?.getTime() ?? 0) >= cutoff))
    .map((p) => ({ productId: p.id, name: p.name, sku: p.sku, units: p.currentStock, tiedUp: r2(p.currentStock * p.costPrice), lastSold: args.lastSold.get(p.id)?.toISOString() ?? null }))
    .sort((a, b) => b.tiedUp - a.tiedUp);
  return { items, tiedUp: r2(items.reduce((s, i) => s + i.tiedUp, 0)), days };
}
