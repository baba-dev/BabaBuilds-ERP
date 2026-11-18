import { decimalToNumber, roundMoneyDecimal, toDecimal } from '@/lib/money';
import { monthsPerCycle } from '@/lib/retainers/schedule';
import { addUtcMonths, utcDay } from './usage-math';

/**
 * Accrual billing: every email address is charged a monthly price for each day it has been in service, and what has built
 * up is collected on whatever date the owner chooses. No schedule, no invoice until a collection.
 *
 * Days are whole UTC days. A period is [first day, last day] inclusive on both ends, so an address issued on 10 January and
 * collected on 9 February has had exactly one month of service.
 */

const DAY_MS = 86_400_000;
const dayNumber = (date: Date) => Math.round(utcDay(date).getTime() / DAY_MS);
const addDays = (date: Date, days: number) => new Date(utcDay(date).getTime() + days * DAY_MS);

/**
 * Months of service from `start` up to (not including) `endExclusive`: whole calendar months counted from the start date,
 * plus the remaining days as a fraction of the length of the month they fall in. One exact month is exactly 1, and
 * month-end starts do not drift (31 January + 1 month = 28/29 February).
 */
export function monthsBetween(start: Date, endExclusive: Date): number {
  const s = utcDay(start);
  const e = utcDay(endExclusive);
  if (e.getTime() <= s.getTime()) return 0;
  let whole = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
  while (whole > 0 && addUtcMonths(s, whole).getTime() > e.getTime()) whole -= 1;
  const base = addUtcMonths(s, whole);
  const next = addUtcMonths(s, whole + 1);
  const remaining = dayNumber(e) - dayNumber(base);
  const length = dayNumber(next) - dayNumber(base);
  return whole + remaining / length;
}

/** Price per month for a plan whose price covers a month, a quarter or a year. */
export function monthlyRate(price: unknown, frequency: string): number {
  return decimalToNumber(toDecimal(price as never).div(monthsPerCycle(frequency)));
}

export type AccrualPeriod = {
  /** First day charged (inclusive). */
  firstDay: Date;
  /** Last day charged (inclusive). */
  lastDay: Date;
  months: number;
  amount: number;
};

/**
 * What one address owes. Charging starts on `billingStartsOn`, or the day after `billedThrough` once something has been
 * collected, and runs to `asOf` (inclusive) or to the day service ended (`endsBefore`, exclusive), whichever is first.
 * Returns null when there is nothing to charge yet.
 */
export function accrueAddress(args: {
  billingStartsOn: Date;
  billedThrough: Date | null;
  asOf: Date;
  /** The first day the address was no longer in service (removal or cancellation), exclusive. */
  endsBefore?: Date | null;
  monthlyRate: number;
}): AccrualPeriod | null {
  const first = args.billedThrough ? addDays(args.billedThrough, 1) : utcDay(args.billingStartsOn);
  let endExclusive = addDays(args.asOf, 1);
  if (args.endsBefore && utcDay(args.endsBefore).getTime() < endExclusive.getTime()) endExclusive = utcDay(args.endsBefore);
  if (endExclusive.getTime() <= first.getTime()) return null;
  const months = monthsBetween(first, endExclusive);
  const amount = decimalToNumber(roundMoneyDecimal(toDecimal(args.monthlyRate).mul(months)));
  return { firstDay: first, lastDay: addDays(endExclusive, -1), months, amount };
}
