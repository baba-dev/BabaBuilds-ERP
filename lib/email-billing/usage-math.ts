import { subMonths } from 'date-fns';
import { decimalToNumber, roundMoneyDecimal, toDecimal } from '@/lib/money';
import { monthsPerCycle } from '@/lib/retainers/schedule';

/** Pure helpers for usage-based Email Hosting billing. No I/O, so every rule here is unit tested. */

export type UsagePolicy = 'LATEST' | 'HIGH_WATER_MARK';
const DAY_MS = 86_400_000;

/** UTC midnight of the day containing `date`. Snapshots are keyed by this so the daily job is idempotent. */
export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Start of the billing cycle that ends at `nextBillingDate` (invoices are raised at the start of each cycle). */
export function cycleStart(nextBillingDate: Date, frequency: string): Date {
  return subMonths(nextBillingDate, monthsPerCycle(frequency));
}

/**
 * Share of the current cycle still ahead of `effectiveOn`, in whole days, clamped to 0..1.
 * 0 when the next invoice is already due (the new quantity is simply billed at full price on it).
 */
export function remainingCycleFraction(effectiveOn: Date, nextBillingDate: Date, frequency: string): number {
  const start = cycleStart(nextBillingDate, frequency).getTime();
  const total = Math.round((nextBillingDate.getTime() - start) / DAY_MS);
  if (total <= 0) return 0;
  const left = Math.floor((nextBillingDate.getTime() - effectiveOn.getTime()) / DAY_MS);
  return Math.min(1, Math.max(0, left / total));
}

/** Prorated charge for an increase of `recurringDelta` per cycle that takes effect part-way through the cycle. */
export function prorateIncrease(recurringDelta: number, fraction: number): number {
  if (!(recurringDelta > 0) || !(fraction > 0)) return 0;
  return decimalToNumber(roundMoneyDecimal(toDecimal(recurringDelta).mul(fraction)));
}

/** Mailboxes that count toward billing: active only, optionally excluding admin accounts. */
export function countBillableMailboxes(
  mailboxes: Array<{ status: string; isAdmin: boolean }>,
  options: { ignoreAdmins: boolean },
): number {
  return mailboxes.filter((m) => m.status === 'ACTIVE' && !(options.ignoreAdmins && m.isAdmin)).length;
}

/**
 * Which mailbox count to bill. LATEST uses the most recent reading. HIGH_WATER_MARK uses the highest reading taken
 * in the current cycle (callers pass only that cycle's snapshots), so a mailbox added and removed within a cycle is
 * still paid for once, and decreases take effect when the next cycle starts.
 */
export function pickBillableCount(
  policy: UsagePolicy,
  latest: number,
  cycleCounts: number[],
): number {
  if (policy === 'HIGH_WATER_MARK' && cycleCounts.length > 0) return Math.max(latest, ...cycleCounts);
  return latest;
}

export type RetainerItemRow = { id: string; title: string; quantity: number; unitPrice: unknown; taxRate: number | null };
export type LineItem = { title: string; quantity: number; unitPrice: number };

/** Titles the Email Hosting calculator generates for a domain; only these retainer lines are ever managed. */
export function managedTitles(domain: string): string[] {
  return [`Professional Email Hosting - ${domain}`, `Email Mailbox Seats - ${domain}`, `Extra Email Mailboxes - ${domain}`];
}

/**
 * How to bring a retainer's lines in line with the calculator output without touching lines a person added or edited:
 * only lines whose title the calculator generates are updated, created or removed.
 */
export function planRetainerItemSync(existing: RetainerItemRow[], lines: LineItem[], domain: string) {
  const managed = new Set(managedTitles(domain));
  const current = new Map(existing.filter((i) => managed.has(i.title)).map((i) => [i.title, i]));
  const wanted = new Set(lines.map((l) => l.title));
  const taxRate = [...current.values()][0]?.taxRate ?? 0;

  const update: Array<{ id: string; quantity: number; unitPrice: number }> = [];
  const create: Array<{ title: string; quantity: number; unitPrice: number; taxRate: number }> = [];
  for (const line of lines) {
    const row = current.get(line.title);
    if (row) {
      if (row.quantity !== line.quantity || decimalToNumber(row.unitPrice as never) !== line.unitPrice) {
        update.push({ id: row.id, quantity: line.quantity, unitPrice: line.unitPrice });
      }
    } else if (line.quantity > 0) {
      create.push({ title: line.title, quantity: line.quantity, unitPrice: line.unitPrice, taxRate });
    }
  }
  const remove = [...current.values()].filter((i) => !wanted.has(i.title)).map((i) => i.id);
  return { update, create, remove };
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** `date` plus `months` calendar months, always measured from the original day (Jan 31 + 1 month = Feb 28, + 2 months = Mar 31). */
export function addUtcMonths(date: Date, months: number): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), daysInUtcMonth(year, month))));
}

/**
 * The billing date that follows a service start (issue) date: the start day itself when it is today or later, otherwise
 * the next monthly/quarterly/yearly anniversary of it. Anniversaries are counted from the start date, so a domain issued
 * on 31 January is billed on 28/29 February and back on 31 March, never drifting.
 */
export function nextAnniversary(start: Date, frequency: string, from: Date): Date {
  const first = utcDay(start);
  const today = utcDay(from);
  if (first.getTime() >= today.getTime()) return first;
  const step = monthsPerCycle(frequency);
  const gap = (today.getUTCFullYear() - first.getUTCFullYear()) * 12 + (today.getUTCMonth() - first.getUTCMonth());
  let cycles = Math.max(1, Math.ceil(gap / step));
  while (addUtcMonths(first, (cycles - 1) * step).getTime() >= today.getTime() && cycles > 1) cycles -= 1;
  let due = addUtcMonths(first, cycles * step);
  while (due.getTime() < today.getTime()) { cycles += 1; due = addUtcMonths(first, cycles * step); }
  return due;
}
