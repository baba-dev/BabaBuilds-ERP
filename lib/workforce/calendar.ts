/**
 * Day arithmetic for attendance and leave. Everything is a calendar date in UTC (a "day" is the UTC midnight of its date),
 * the same convention payroll uses, so the two modules always agree about which day a record belongs to.
 * Pure functions, so the rules are easy to test.
 */
export const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
export const DEFAULT_WORKING_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const DAY = 86_400_000;

/** A date-only value as the UTC midnight of that day. "2026-11-15" and any time on that UTC date give the same day. */
export function utcDay(input: Date | string): Date {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date(`${input}T00:00:00.000Z`);
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
export const isValidDate = (d: Date): boolean => Number.isFinite(d.getTime());

export function parseWorkingDays(json: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(json ?? '[]');
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((d) => String(d).toUpperCase());
  } catch {
    /* fall back to the default week */
  }
  return [...DEFAULT_WORKING_DAYS];
}

/** Holiday dates falling in [from, to], expanding the ones that repeat every year. */
export function holidayDates(holidays: { date: Date; isRecurring: boolean; year?: number | null }[], from: Date, to: Date): Set<string> {
  const out = new Set<string>();
  const years = new Set<number>();
  for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y += 1) years.add(y);
  for (const h of holidays) {
    if (h.isRecurring) {
      for (const y of years) out.add(dayKey(new Date(Date.UTC(y, h.date.getUTCMonth(), h.date.getUTCDate()))));
    } else out.add(dayKey(utcDay(h.date)));
  }
  return out;
}

export function isWorkingDay(day: Date, workingDays: string[], holidays: Set<string>): boolean {
  return workingDays.includes(WEEKDAYS[day.getUTCDay()]!) && !holidays.has(dayKey(day));
}

export type HalfDay = 'NONE' | 'FIRST' | 'SECOND';

/**
 * The days a leave request uses: working days only (weekly offs and holidays are free), with a half day allowed when the
 * request is a single working day. Returns the weight of each counted date so a request that crosses a year end can be
 * charged to each year's balance.
 */
export function countLeaveDays(args: { start: Date; end: Date; workingDays: string[]; holidays: Set<string>; halfDay?: HalfDay }) {
  const from = utcDay(args.start).getTime();
  const to = utcDay(args.end).getTime();
  const dates: { date: string; weight: number }[] = [];
  for (let t = from; t <= to; t += DAY) {
    const d = new Date(t);
    if (isWorkingDay(d, args.workingDays, args.holidays)) dates.push({ date: dayKey(d), weight: 1 });
  }
  if (args.halfDay && args.halfDay !== 'NONE' && dates.length === 1) dates[0]!.weight = 0.5;
  return { days: dates.reduce((s, x) => s + x.weight, 0), dates };
}

/** Days charged to each calendar year. */
export function daysByYear(dates: { date: string; weight: number }[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const x of dates) {
    const y = Number(x.date.slice(0, 4));
    out[y] = (out[y] ?? 0) + x.weight;
  }
  return out;
}

/** True when two inclusive date ranges share at least one day. */
export function rangesOverlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return utcDay(a.start).getTime() <= utcDay(b.end).getTime() && utcDay(b.start).getTime() <= utcDay(a.end).getTime();
}

/** Yearly entitlement, shared out by month for someone who joins part-way through the year (to the nearest half day). */
export function prorateEntitlement(yearlyDays: number, joinDate: Date | null | undefined, year: number): number {
  if (!joinDate || joinDate.getUTCFullYear() < year) return yearlyDays;
  if (joinDate.getUTCFullYear() > year) return 0;
  const monthsLeft = 12 - joinDate.getUTCMonth();
  return Math.round(((yearlyDays * monthsLeft) / 12) * 2) / 2;
}

// ── Time in the workspace's time zone ───────────────────────────────────────────────────────────────────────────

function zoneParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

/** Today's date where the workplace is (as a UTC-midnight day), so an evening check-in in India is not filed under yesterday. */
export function todayInZone(now: Date, timeZone: string): Date {
  try {
    const p = zoneParts(now, timeZone);
    return new Date(Date.UTC(p.y, p.m - 1, p.d));
  } catch {
    return utcDay(now);
  }
}

export function minutesIntoDay(now: Date, timeZone: string): number {
  try {
    const p = zoneParts(now, timeZone);
    return p.h * 60 + p.min;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

/** PRESENT, or LATE when the check-in is more than `graceMinutes` after the workday starts. */
export function checkInStatus(now: Date, timeZone: string, workStart: string, graceMinutes = 15): 'PRESENT' | 'LATE' {
  const [h, m] = workStart.split(':').map(Number);
  const start = (h ?? 9) * 60 + (m ?? 0);
  return minutesIntoDay(now, timeZone) > start + graceMinutes ? 'LATE' : 'PRESENT';
}
