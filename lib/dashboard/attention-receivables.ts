import { Prisma } from "@prisma/client";
import { toDecimal } from "@/lib/money";

export type AttentionReceivableRow = {
  invoiceDate: Date;
  totalAmount: Prisma.Decimal | number | string;
  grandTotal: Prisma.Decimal | number | string | null;
  amountReceived: number | null;
};

export function summarizeReceivablesForAttention(rows: AttentionReceivableRow[], now: Date = new Date()) {
  let overdueReceivables = 0;
  let outstandingReceivables = 0;

  for (const row of rows) {
    const billed = toDecimal(row.grandTotal ?? row.totalAmount);
    const received = toDecimal(row.amountReceived ?? 0);
    const outstanding = Prisma.Decimal.max(new Prisma.Decimal(0), billed.minus(received));
    if (outstanding.equals(0)) continue;

    outstandingReceivables += 1;

    const dueDate = new Date(row.invoiceDate);
    dueDate.setDate(dueDate.getDate() + 30);
    if (dueDate < now) overdueReceivables += 1;
  }

  return { overdueReceivables, outstandingReceivables };
}
