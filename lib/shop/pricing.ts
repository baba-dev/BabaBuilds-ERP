import { computePosTotals } from '@/lib/pos/totals';

export type ShopLine = { productId: string; name: string; sku: string; quantity: number; unitPrice: number; taxRate: number };
export type PricedShopLine = ShopLine & { lineTotal: number; lineTax: number };

/**
 * Prices a basket: tax on each line at the product's own GST rate (when the shop may charge GST), whole-paise arithmetic,
 * identical to the counter. The same product listed twice is merged into one line so stock is checked against the total asked for.
 */
export function priceShopOrder(lines: ShopLine[], chargesGst: boolean) {
  const merged = new Map<string, ShopLine>();
  for (const l of lines) {
    const cur = merged.get(l.productId);
    merged.set(l.productId, cur ? { ...cur, quantity: cur.quantity + l.quantity } : { ...l });
  }
  const list = [...merged.values()];
  const t = computePosTotals(list.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity, taxRate: l.taxRate })), 0, chargesGst);
  const priced: PricedShopLine[] = list.map((l, i) => ({ ...l, taxRate: chargesGst ? l.taxRate : 0, lineTotal: t.lines[i]!.net, lineTax: t.lines[i]!.tax }));
  return { lines: priced, subtotal: t.subtotal, tax: t.tax, total: t.total };
}

/** Smallest currency unit for a gateway (paise, cents); zero-decimal currencies stay whole. */
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF', 'ISK']);
export function toMinorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? Math.round(amount) : Math.round((amount + Number.EPSILON) * 100);
}
