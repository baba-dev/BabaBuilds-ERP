import { Prisma } from "@prisma/client";
import { toDecimal } from "@/lib/money";

type MoneyLike = Prisma.Decimal | number | string | null | undefined;

export type AttentionReceivableRow = {
  invoiceDate: Date;
  /** Falls back to `invoiceDate + DEFAULT_TERMS_DAYS` when the invoice has no due date. */
  dueDate?: Date | null;
  totalAmount: Prisma.Decimal | number | string;
  grandTotal: Prisma.Decimal | number | string | null;
  amountReceived: Prisma.Decimal | number | string | null;
  /** Invoice currency to workspace base currency. Defaults to 1. */
  exchangeRate?: MoneyLike;
  id?: string;
  invoiceNumber?: string;
  clientName?: string;
};

export type ReceivablesAging = {
  notDue: Prisma.Decimal;
  days1to30: Prisma.Decimal;
  days31to60: Prisma.Decimal;
  days61plus: Prisma.Decimal;
};

export type ReceivableWatchItem = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  /** Balance still owed, in the workspace base currency. */
  outstanding: Prisma.Decimal;
  dueDate: Date;
  /** Whole days past the due date; 0 or negative means not yet due. */
  daysOverdue: number;
};

export type ReceivablesSnapshot = {
  overdueReceivables: number;
  outstandingReceivables: number;
  dueSoonReceivables: number;
  overdueAmount: Prisma.Decimal;
  outstandingAmount: Prisma.Decimal;
  aging: ReceivablesAging;
  watchlist: ReceivableWatchItem[];
  /** Not yet overdue, due within the next week, soonest first. */
  dueSoon: ReceivableWatchItem[];
};

const DEFAULT_TERMS_DAYS = 30;
const DUE_SOON_DAYS = 7;
const MS_PER_DAY = 86_400_000;
const ZERO = new Prisma.Decimal(0);

/** Legacy rows can carry `grandTotal = 0`; the billed amount is then `totalAmount`. */
function billedAmount(row: AttentionReceivableRow): Prisma.Decimal {
  const grand = row.grandTotal == null ? ZERO : toDecimal(row.grandTotal);
  return grand.gt(0) ? grand : toDecimal(row.totalAmount);
}

export function resolveReceivableDueDate(row: Pick<AttentionReceivableRow, "invoiceDate" | "dueDate">): Date {
  if (row.dueDate) return new Date(row.dueDate);
  const due = new Date(row.invoiceDate);
  due.setDate(due.getDate() + DEFAULT_TERMS_DAYS);
  return due;
}

/**
 * One pass over the open invoices: counts, base-currency amounts, an aging
 * split by days past due, and the largest overdue balances to chase first.
 */
export function buildReceivablesSnapshot(
  rows: AttentionReceivableRow[],
  now: Date = new Date(),
  watchlistSize = 5,
): ReceivablesSnapshot {
  const aging: ReceivablesAging = { notDue: ZERO, days1to30: ZERO, days31to60: ZERO, days61plus: ZERO };
  let overdueReceivables = 0;
  let outstandingReceivables = 0;
  let dueSoonReceivables = 0;
  let overdueAmount = ZERO;
  let outstandingAmount = ZERO;
  const open: ReceivableWatchItem[] = [];

  for (const row of rows) {
    const balance = Prisma.Decimal.max(ZERO, billedAmount(row).minus(toDecimal(row.amountReceived ?? 0)));
    if (balance.equals(0)) continue;

    const rate = row.exchangeRate == null ? new Prisma.Decimal(1) : toDecimal(row.exchangeRate);
    const outstanding = balance.mul(rate.gt(0) ? rate : 1).toDecimalPlaces(2);
    const dueDate = resolveReceivableDueDate(row);
    const msPastDue = now.getTime() - dueDate.getTime();
    const daysOverdue = msPastDue > 0 ? Math.max(1, Math.ceil(msPastDue / MS_PER_DAY)) : Math.floor(msPastDue / MS_PER_DAY);

    outstandingReceivables += 1;
    outstandingAmount = outstandingAmount.plus(outstanding);

    if (msPastDue > 0) {
      overdueReceivables += 1;
      overdueAmount = overdueAmount.plus(outstanding);
      if (daysOverdue <= 30) aging.days1to30 = aging.days1to30.plus(outstanding);
      else if (daysOverdue <= 60) aging.days31to60 = aging.days31to60.plus(outstanding);
      else aging.days61plus = aging.days61plus.plus(outstanding);
    } else {
      aging.notDue = aging.notDue.plus(outstanding);
      if (-msPastDue <= DUE_SOON_DAYS * MS_PER_DAY) dueSoonReceivables += 1;
    }

    if (row.id) {
      open.push({
        id: row.id,
        invoiceNumber: row.invoiceNumber ?? "",
        clientName: row.clientName ?? "",
        outstanding,
        dueDate,
        daysOverdue,
      });
    }
  }

  // Overdue first (largest balance leads), then whatever falls due soonest.
  const watchlist = [...open]
    .sort((a, b) => {
      const aOverdue = a.daysOverdue > 0;
      const bOverdue = b.daysOverdue > 0;
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      if (aOverdue) return b.outstanding.comparedTo(a.outstanding) || b.daysOverdue - a.daysOverdue;
      return a.dueDate.getTime() - b.dueDate.getTime();
    })
    .slice(0, watchlistSize);

  const dueSoon = open
    .filter((item) => item.daysOverdue <= 0 && item.dueDate.getTime() - now.getTime() <= DUE_SOON_DAYS * MS_PER_DAY)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, watchlistSize);

  return {
    overdueReceivables,
    outstandingReceivables,
    dueSoonReceivables,
    overdueAmount,
    outstandingAmount,
    aging,
    watchlist,
    dueSoon,
  };
}

export function summarizeReceivablesForAttention(rows: AttentionReceivableRow[], now: Date = new Date()) {
  const { overdueReceivables, outstandingReceivables } = buildReceivablesSnapshot(rows, now, 0);
  return { overdueReceivables, outstandingReceivables };
}
