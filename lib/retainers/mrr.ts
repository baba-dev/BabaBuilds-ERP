import { toDecimal } from "@/lib/money";
import { amountsOfItems } from "@/lib/retainers/pricing-amounts";
import { monthlyEquivalent } from "@/lib/retainers/schedule";

type Items = Array<{ quantity: number; unitPrice: unknown; taxRate: number | null }>;

/** Monthly recurring revenue (ex tax, base currency) a retainer contributes right now. Only ACTIVE retainers count. */
export function retainerMrr(args: { status: string; frequency: string; exchangeRate: unknown; items: Items }): number {
  if (args.status !== "ACTIVE") return 0;
  const a = amountsOfItems(args.items as Parameters<typeof amountsOfItems>[0]);
  return Math.round(monthlyEquivalent(a.subtotal.toNumber(), args.frequency) * toDecimal(args.exchangeRate as never).toNumber() * 100) / 100;
}
