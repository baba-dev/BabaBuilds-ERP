import { qrmpGstr3bDueDay } from "./states";
import { RETURN_LABEL, type ReturnType } from "./rules";

export type RegistrationType = "REGULAR" | "COMPOSITION" | "UNREGISTERED";
export type FilingFrequency = "MONTHLY" | "QRMP";

export type GstSettings = {
  registrationType: RegistrationType;
  filingFrequency: FilingFrequency;
  stateCode: string | null;
};

export type Obligation = {
  returnType: ReturnType;
  periodKey: string;
  label: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  /** IFF and PMT-06 are optional / payment-only steps. */
  optional: boolean;
};

export type ObligationStatus = "FILED" | "OVERDUE" | "DUE_SOON" | "PENDING" | "OPEN_PERIOD";

const utc = (y: number, m: number, d: number, end = false) =>
  end ? new Date(Date.UTC(y, m, d, 23, 59, 59, 999)) : new Date(Date.UTC(y, m, d));

/** Financial year start year for a date (Apr-Mar). */
export function fyStartYear(date: Date): number {
  return date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

export const fyLabel = (startYear: number) => `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

export function parseFyLabel(label: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return null;
  const start = Number(m[1]);
  return (start + 1) % 100 === Number(m[2]) ? start : null;
}

export const fyBounds = (startYear: number) => ({ start: utc(startYear, 3, 1), end: utc(startYear + 1, 2, 31, true) });

export const monthKey = (year: number, month0: number) => `${year}-${String(month0 + 1).padStart(2, "0")}`;

/** Quarter key: the FY start year plus Q1 (Apr-Jun) .. Q4 (Jan-Mar), e.g. "2026-Q1". */
export const quarterKey = (startYear: number, q: 1 | 2 | 3 | 4) => `${startYear}-Q${q}`;

export function parseMonthKey(key: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const month0 = Number(m[2]) - 1;
  if (month0 < 0 || month0 > 11) return null;
  const y = Number(m[1]);
  return { start: utc(y, month0, 1), end: utc(y, month0 + 1, 0, true) };
}

export function parseQuarterKey(key: string): { start: Date; end: Date; startYear: number; quarter: 1 | 2 | 3 | 4 } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(key);
  if (!m) return null;
  const startYear = Number(m[1]);
  const quarter = Number(m[2]) as 1 | 2 | 3 | 4;
  const startMonth0 = (3 + (quarter - 1) * 3) % 12;
  const startCalYear = quarter === 4 ? startYear + 1 : startYear;
  return { start: utc(startCalYear, startMonth0, 1), end: utc(startCalYear, startMonth0 + 3, 0, true), startYear, quarter };
}

/** Resolve any supported period key to its date range. */
export function periodRange(key: string): { start: Date; end: Date } | null {
  if (/^\d{4}-\d{2}$/.test(key)) {
    // "2025-26" (annual) also matches the monthly shape; month part >12 distinguishes it.
    const monthly = parseMonthKey(key);
    if (monthly) return monthly;
    const fy = parseFyLabel(key);
    return fy === null ? null : fyBounds(fy);
  }
  const q = parseQuarterKey(key);
  return q ? { start: q.start, end: q.end } : null;
}

function monthlyObligations(startYear: number, settings: GstSettings): Obligation[] {
  const out: Obligation[] = [];
  for (let i = 0; i < 12; i += 1) {
    const month0 = (3 + i) % 12;
    const year = month0 >= 3 ? startYear : startYear + 1;
    const key = monthKey(year, month0);
    const start = utc(year, month0, 1);
    const end = utc(year, month0 + 1, 0, true);
    out.push({ returnType: "GSTR1", periodKey: key, label: RETURN_LABEL.GSTR1, periodStart: start, periodEnd: end, dueDate: utc(year, month0 + 1, 11), optional: false });
    out.push({ returnType: "GSTR3B", periodKey: key, label: RETURN_LABEL.GSTR3B, periodStart: start, periodEnd: end, dueDate: utc(year, month0 + 1, 20), optional: false });
  }
  void settings;
  return out;
}

function qrmpObligations(startYear: number, settings: GstSettings): Obligation[] {
  const out: Obligation[] = [];
  const day3b = qrmpGstr3bDueDay(settings.stateCode);
  for (let q = 1 as 1 | 2 | 3 | 4; q <= 4; q = (q + 1) as 1 | 2 | 3 | 4) {
    const range = parseQuarterKey(quarterKey(startYear, q))!;
    const qEndYear = range.end.getUTCFullYear();
    const qEndMonth0 = range.end.getUTCMonth();
    const key = quarterKey(startYear, q);
    out.push({ returnType: "GSTR1", periodKey: key, label: RETURN_LABEL.GSTR1, periodStart: range.start, periodEnd: range.end, dueDate: utc(qEndYear, qEndMonth0 + 1, 13), optional: false });
    out.push({ returnType: "GSTR3B", periodKey: key, label: RETURN_LABEL.GSTR3B, periodStart: range.start, periodEnd: range.end, dueDate: utc(qEndYear, qEndMonth0 + 1, day3b), optional: false });
    // Months 1 and 2 of each quarter: optional IFF (13th) and the PMT-06 tax payment (25th).
    for (let i = 0; i < 2; i += 1) {
      const month0 = (range.start.getUTCMonth() + i) % 12;
      const year = range.start.getUTCFullYear() + (range.start.getUTCMonth() + i >= 12 ? 1 : 0);
      const mKey = monthKey(year, month0);
      const mStart = utc(year, month0, 1);
      const mEnd = utc(year, month0 + 1, 0, true);
      out.push({ returnType: "IFF", periodKey: mKey, label: RETURN_LABEL.IFF, periodStart: mStart, periodEnd: mEnd, dueDate: utc(year, month0 + 1, 13), optional: true });
      out.push({ returnType: "PMT06", periodKey: mKey, label: RETURN_LABEL.PMT06, periodStart: mStart, periodEnd: mEnd, dueDate: utc(year, month0 + 1, 25), optional: true });
    }
  }
  return out;
}

function compositionObligations(startYear: number): Obligation[] {
  const out: Obligation[] = [];
  for (let q = 1 as 1 | 2 | 3 | 4; q <= 4; q = (q + 1) as 1 | 2 | 3 | 4) {
    const range = parseQuarterKey(quarterKey(startYear, q))!;
    out.push({
      returnType: "CMP08",
      periodKey: quarterKey(startYear, q),
      label: RETURN_LABEL.CMP08,
      periodStart: range.start,
      periodEnd: range.end,
      dueDate: utc(range.end.getUTCFullYear(), range.end.getUTCMonth() + 1, 18),
      optional: false,
    });
  }
  const { start, end } = fyBounds(startYear);
  out.push({ returnType: "GSTR4", periodKey: fyLabel(startYear), label: RETURN_LABEL.GSTR4, periodStart: start, periodEnd: end, dueDate: utc(startYear + 1, 3, 30), optional: false });
  return out;
}

/** Every return the registration must (or may) file for one financial year, in due-date order. */
export function obligationsForFy(startYear: number, settings: GstSettings, opts: { gstr9Optional?: boolean; gstr9cRequired?: boolean } = {}): Obligation[] {
  if (settings.registrationType === "UNREGISTERED") return [];
  const { start, end } = fyBounds(startYear);
  let list: Obligation[];
  if (settings.registrationType === "COMPOSITION") {
    list = compositionObligations(startYear);
  } else {
    list = settings.filingFrequency === "QRMP" ? qrmpObligations(startYear, settings) : monthlyObligations(startYear, settings);
    const annualDue = utc(startYear + 1, 11, 31);
    list.push({ returnType: "GSTR9", periodKey: fyLabel(startYear), label: RETURN_LABEL.GSTR9, periodStart: start, periodEnd: end, dueDate: annualDue, optional: !!opts.gstr9Optional });
    if (opts.gstr9cRequired) {
      list.push({ returnType: "GSTR9C", periodKey: fyLabel(startYear), label: RETURN_LABEL.GSTR9C, periodStart: start, periodEnd: end, dueDate: annualDue, optional: false });
    }
  }
  return list.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.returnType.localeCompare(b.returnType));
}

export function effectiveDueDate(o: Pick<Obligation, "dueDate">, extended?: Date | null): Date {
  return extended && extended.getTime() > o.dueDate.getTime() ? extended : o.dueDate;
}

export function obligationStatus(
  o: Pick<Obligation, "periodEnd" | "dueDate">,
  row: { status: string; extendedDueDate?: Date | null } | null | undefined,
  now: Date = new Date(),
): ObligationStatus {
  if (row?.status === "FILED") return "FILED";
  if (now.getTime() <= o.periodEnd.getTime()) return "OPEN_PERIOD";
  const due = effectiveDueDate(o, row?.extendedDueDate);
  const dueEnd = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate(), 23, 59, 59, 999));
  if (now.getTime() > dueEnd.getTime()) return "OVERDUE";
  return dueEnd.getTime() - now.getTime() <= 7 * 86400000 ? "DUE_SOON" : "PENDING";
}

export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86400000));
}

/** Days past the (effective) due date up to `asOf` (filing date or today). */
export function daysLate(due: Date, asOf: Date): number {
  const dueEnd = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate(), 23, 59, 59, 999);
  return asOf.getTime() <= dueEnd ? 0 : Math.ceil((asOf.getTime() - dueEnd) / 86400000);
}

/** GSTR-1/3B period keys covered by a return obligation (a quarter expands to its three months). */
export function monthsOfPeriod(key: string): string[] {
  const q = parseQuarterKey(key);
  if (q) {
    return [0, 1, 2].map((i) => {
      const m0 = q.start.getUTCMonth() + i;
      return monthKey(q.start.getUTCFullYear() + Math.floor(m0 / 12), m0 % 12);
    });
  }
  if (parseMonthKey(key)) return [key];
  const fy = parseFyLabel(key);
  if (fy === null) return [];
  return Array.from({ length: 12 }, (_, i) => {
    const m0 = (3 + i) % 12;
    return monthKey(m0 >= 3 ? fy : fy + 1, m0);
  });
}

/**
 * Returns before this date are not shown as owed: GST compliance starts at the registration date, or at the first
 * invoice if that was never recorded, so a newly connected workspace is not greeted by a year of "overdue".
 */
export function trackingStart(profile: { registeredFrom: Date | null }, firstInvoice: Date | null, now: Date): Date {
  if (profile.registeredFrom) return new Date(Date.UTC(profile.registeredFrom.getUTCFullYear(), profile.registeredFrom.getUTCMonth(), 1));
  if (firstInvoice) return new Date(Date.UTC(firstInvoice.getUTCFullYear(), firstInvoice.getUTCMonth(), 1));
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
