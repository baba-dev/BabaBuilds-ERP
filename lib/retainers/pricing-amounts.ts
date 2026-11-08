import { Prisma } from "@prisma/client";
import { toDecimal } from "@/lib/money";

/** Per-cycle amounts of stored items (fractional tax rates), no I/O. */
export function amountsOfItems(items: Array<{ quantity: number; unitPrice: Prisma.Decimal | number | string; taxRate: number | null }>) {
  let subtotal = new Prisma.Decimal(0);
  let tax = new Prisma.Decimal(0);
  for (const i of items) {
    const line = toDecimal(i.quantity).mul(toDecimal(i.unitPrice));
    subtotal = subtotal.plus(line);
    tax = tax.plus(line.mul(toDecimal(i.taxRate ?? 0)));
  }
  subtotal = subtotal.toDecimalPlaces(2);
  tax = tax.toDecimalPlaces(2);
  return { subtotal, tax, total: subtotal.plus(tax) };
}
