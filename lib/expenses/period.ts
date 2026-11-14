export type PeriodKey = "this_month" | "last_month" | "this_quarter" | "last_quarter" | "this_fy" | "last_fy" | "all" | "custom";
export const PERIOD_KEYS: PeriodKey[] = ["this_month", "last_month", "this_quarter", "last_quarter", "this_fy", "last_fy", "all", "custom"];

export type PeriodRange = { key: PeriodKey; from: Date | null; to: Date | null };

const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m, d));

/** Financial year starts in April for India and in January elsewhere. Ranges are [from, to) in UTC. */
export function resolvePeriod(key: PeriodKey, countryCode: string, now = new Date(), custom?: { from?: string | null; to?: string | null }): PeriodRange {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const fyStartMonth = countryCode.toUpperCase() === "IN" ? 3 : 0;
  const fyYear = m >= fyStartMonth ? y : y - 1;
  switch (key) {
    case "this_month": return { key, from: utc(y, m), to: utc(y, m + 1) };
    case "last_month": return { key, from: utc(y, m - 1), to: utc(y, m) };
    case "this_quarter":
    case "last_quarter": {
      // Quarters follow the financial year: April to June for India, January to March elsewhere.
      const q = Math.floor((((m - fyStartMonth) % 12) + 12) % 12 / 3);
      const start = new Date(Date.UTC(m >= fyStartMonth ? y : y - 1, fyStartMonth + q * 3, 1));
      const from = key === "this_quarter" ? start : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 3, 1));
      return { key, from, to: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 3, 1)) };
    }
    case "this_fy": return { key, from: utc(fyYear, fyStartMonth), to: utc(fyYear + 1, fyStartMonth) };
    case "last_fy": return { key, from: utc(fyYear - 1, fyStartMonth), to: utc(fyYear, fyStartMonth) };
    case "custom": {
      const from = custom?.from ? new Date(custom.from) : null;
      const to = custom?.to ? new Date(custom.to) : null;
      const okFrom = from && !Number.isNaN(from.getTime()) ? from : null;
      const okTo = to && !Number.isNaN(to.getTime()) ? new Date(to.getTime() + 86_400_000) : null;
      return { key, from: okFrom, to: okTo };
    }
    default: return { key: "all", from: null, to: null };
  }
}

/** The same span one year earlier, for "vs last year". */
export function yearAgoRange(range: PeriodRange): PeriodRange | null {
  if (!range.from || !range.to) return null;
  const shift = (d: Date) => new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate()));
  return { key: range.key, from: shift(range.from), to: shift(range.to) };
}

/** The span just before a range, of the same length, for "vs last period". */
export function previousRange(range: PeriodRange): PeriodRange | null {
  if (!range.from || !range.to) return null;
  const span = range.to.getTime() - range.from.getTime();
  return { key: range.key, from: new Date(range.from.getTime() - span), to: range.from };
}

export const asPeriodKey = (v: string | null | undefined): PeriodKey => (PERIOD_KEYS.includes(v as PeriodKey) ? (v as PeriodKey) : "this_fy");
