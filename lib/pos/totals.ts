/**
 * Counter-sale arithmetic, in whole paise so a bill never carries fractions of a paisa. The register shows these figures and
 * the checkout route stores them, so what the customer sees is exactly what is charged.
 */
export type PosLine = { unitPrice: number; quantity: number; taxRate: number };
export type PosTotals = {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
  lines: { net: number; discount: number; taxable: number; tax: number }[];
};

const paise = (n: number) => Math.round((n + Number.EPSILON) * 100);
const rupees = (p: number) => p / 100;

/**
 * The discount is spread over the lines in proportion to their value (the last line takes the rounding remainder), and tax is
 * worked out on what each line costs after its share of the discount. `chargesGst` is false for sellers who may not collect tax.
 */
export function computePosTotals(lines: PosLine[], discount = 0, chargesGst = true): PosTotals {
  const nets = lines.map((l) => paise(l.unitPrice) * l.quantity);
  const subtotalP = nets.reduce((s, n) => s + n, 0);
  const discountP = Math.min(Math.max(0, paise(discount)), subtotalP);

  let allocated = 0;
  const shares = nets.map((n, i) => {
    if (subtotalP === 0) return 0;
    if (i === nets.length - 1) return discountP - allocated;
    const share = Math.round((n * discountP) / subtotalP);
    allocated += share;
    return share;
  });

  const out = nets.map((net, i) => {
    const taxable = net - shares[i]!;
    const tax = chargesGst ? Math.round((taxable * Math.max(0, lines[i]!.taxRate)) / 100) : 0;
    return { net, discount: shares[i]!, taxable, tax };
  });
  const taxP = out.reduce((s, l) => s + l.tax, 0);
  return {
    subtotal: rupees(subtotalP),
    discount: rupees(discountP),
    taxable: rupees(subtotalP - discountP),
    tax: rupees(taxP),
    total: rupees(subtotalP - discountP + taxP),
    lines: out.map((l) => ({ net: rupees(l.net), discount: rupees(l.discount), taxable: rupees(l.taxable), tax: rupees(l.tax) })),
  };
}

/** A percentage discount as an amount, rounded to the paisa and never above the subtotal. */
export function percentDiscount(subtotal: number, percent: number): number {
  const p = Math.min(Math.max(0, percent), 100);
  return Math.min(subtotal, rupees(Math.round((paise(subtotal) * p) / 100)));
}

export const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Change to hand back for a cash sale; null when the cash given does not cover the bill. */
export function changeDue(total: number, tendered: number): number | null {
  const t = paise(tendered);
  const due = paise(total);
  return t >= due ? rupees(t - due) : null;
}

/** Quick cash buttons: the exact amount, then the next round notes above it. */
export function cashSuggestions(total: number): number[] {
  const due = Math.ceil(total);
  const out = new Set<number>([due]);
  for (const step of [10, 50, 100, 500, 1000, 2000]) {
    const up = Math.ceil(due / step) * step;
    if (up >= due) out.add(up);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}
