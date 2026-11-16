/** Pay-month and Indian financial-year helpers. All dates are UTC. */

export type MonthBounds = { start: Date; end: Date; startIso: string; endIso: string; year: number; month: number };

export function monthBounds(year: number, month: number): MonthBounds {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59, 999));
  return { start, end, startIso: start.toISOString().slice(0, 10), endIso: end.toISOString().slice(0, 10), year, month };
}

export function monthOf(date: Date): MonthBounds {
  return monthBounds(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

export type FyInfo = { label: string; startYear: number; fyMonth: number; start: Date };

/** "2026-27" style label, plus the position of the month in the year (April = 1, March = 12). */
export function fyOf(date: Date): FyInfo {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const startYear = m >= 4 ? y : y - 1;
  return {
    label: `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
    startYear,
    fyMonth: m >= 4 ? m - 3 : m + 9,
    start: new Date(Date.UTC(startYear, 3, 1)),
  };
}

export function periodLabel(date: Date, locale = 'en-IN'): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/** Statutory due date for a remittance of the given kind for a pay month. */
export function remittanceDueDate(kind: 'PF' | 'ESI' | 'PT' | 'TDS', periodEnd: Date): Date {
  const y = periodEnd.getUTCFullYear();
  const m = periodEnd.getUTCMonth(); // 0-based month of the pay period
  const end = (yy: number, mm: number, d: number) => new Date(Date.UTC(yy, mm, d, 23, 59, 59, 999));
  if (kind === 'PF' || kind === 'ESI') return end(y, m + 1, 15);
  if (kind === 'TDS') return m === 2 ? end(y, 3, 30) : end(y, m + 1, 7); // March tax is due 30 April
  return end(y, m + 2, 0); // professional tax: last day of the following month (state rules vary)
}

export const PAYROLL_KIND_LABEL: Record<'PF' | 'ESI' | 'PT' | 'TDS', string> = {
  PF: 'Provident fund',
  ESI: 'ESI',
  PT: 'Professional tax',
  TDS: 'Income tax (TDS)',
};
