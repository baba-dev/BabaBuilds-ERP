import { addMonths, addYears, endOfMonth, isLastDayOfMonth, isWeekend, previousFriday } from "date-fns";

type Freq = string;

/** The date after `date` for this frequency (month-end stays month-end; weekends roll back to Friday). */
export function advanceBillingDate(date: Date, frequency: Freq): Date {
  let next = new Date(date);
  const wasLastDay = isLastDayOfMonth(next);
  if (frequency === "QUARTERLY") next = addMonths(next, 3);
  else if (frequency === "ANNUALLY") next = addYears(next, 1);
  else next = addMonths(next, 1);
  if (wasLastDay) next = endOfMonth(next);
  if (isWeekend(next)) next = previousFriday(next);
  return next;
}

export type ScheduleLimits = { endDate: Date | null; maxCycles: number | null; cyclesBilled: number };

/** True once no further cycle may be billed. */
export function isFinished(nextBillingDate: Date, limits: ScheduleLimits): boolean {
  if (limits.maxCycles !== null && limits.cyclesBilled >= limits.maxCycles) return true;
  if (limits.endDate && nextBillingDate.getTime() > limits.endDate.getTime()) return true;
  return false;
}

/** The next `count` billing dates that will actually be billed, honouring end date and cycle limit. */
export function upcomingDates(nextBillingDate: Date, frequency: Freq, limits: ScheduleLimits, count = 3): Date[] {
  const out: Date[] = [];
  let cursor = new Date(nextBillingDate);
  let billed = limits.cyclesBilled;
  while (out.length < count && !isFinished(cursor, { ...limits, cyclesBilled: billed })) {
    out.push(cursor);
    cursor = advanceBillingDate(cursor, frequency);
    billed += 1;
  }
  return out;
}

const PER_YEAR: Record<string, number> = { MONTHLY: 12, QUARTERLY: 4, ANNUALLY: 1 };
export function cyclesPerYear(frequency: Freq): number {
  return PER_YEAR[frequency] ?? 12;
}

/** Amount per cycle -> amount per month (so MRR is comparable across frequencies). */
export function monthlyEquivalent(perCycle: number, frequency: Freq): number {
  return (perCycle * cyclesPerYear(frequency)) / 12;
}

/** Months covered by one billing cycle. */
export function monthsPerCycle(frequency: Freq): number {
  return frequency === "QUARTERLY" ? 3 : frequency === "ANNUALLY" ? 12 : 1;
}

/**
 * Auto-renew: push the cycle limit and/or end date out by `cycles` more billing cycles.
 * Returns only the fields that change.
 */
export function extendLimits(limits: ScheduleLimits, frequency: Freq, cycles: number): { maxCycles?: number; endDate?: Date } {
  const out: { maxCycles?: number; endDate?: Date } = {};
  if (limits.maxCycles !== null) out.maxCycles = limits.maxCycles + cycles;
  if (limits.endDate) out.endDate = addMonths(limits.endDate, monthsPerCycle(frequency) * cycles);
  return out;
}

/** Applies a sequence of percentage changes to a unit price (rounded to 2 decimals). */
export function applyPercentChanges(unitPrice: number, percents: number[]): number {
  const factor = percents.reduce((acc, p) => acc * (1 + p / 100), 1);
  return Math.round(unitPrice * factor * 100) / 100;
}

/** Days after the due date at which automatic payment reminders go out. */
export const REMINDER_OFFSETS_DAYS = [3, 7, 14] as const;

/** When the next automatic reminder for an unpaid invoice is due, or null once all have been sent. */
export function nextReminderAt(dueDate: Date | null, reminderCount: number): Date | null {
  if (!dueDate || reminderCount >= REMINDER_OFFSETS_DAYS.length) return null;
  return new Date(dueDate.getTime() + REMINDER_OFFSETS_DAYS[reminderCount] * 86_400_000);
}
