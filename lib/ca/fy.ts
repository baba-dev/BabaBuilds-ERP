import { fyBounds, fyLabel, fyStartYear, parseFyLabel } from "@/lib/gst/calendar";

export { fyBounds, fyLabel, fyStartYear, parseFyLabel };

/** Financial years offered in the picker: the current one back to the earliest year with data (at least two earlier years). */
export function fyOptions(now: Date, earliestDataDate: Date | null, minPast = 2): Array<{ start: number; label: string }> {
  const current = fyStartYear(now);
  const earliest = earliestDataDate ? fyStartYear(earliestDataDate) : current;
  const from = Math.min(earliest, current - minPast);
  const out: Array<{ start: number; label: string }> = [];
  for (let y = current; y >= from; y--) out.push({ start: y, label: fyLabel(y) });
  return out;
}

/** Accept "2026-27" (canonical) or the legacy "26-27" and return the start year. */
export function parseAnyFy(value: string | null | undefined): number | null {
  if (!value) return null;
  const canonical = parseFyLabel(value);
  if (canonical !== null) return canonical;
  const m = /^(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const start = 2000 + Number(m[1]);
  return (start + 1) % 100 === Number(m[2]) ? start : null;
}

/** Whole months of the financial year that have finished (0 before it starts, 12 after it ends). */
export function monthsElapsedInFy(startYear: number, now: Date): number {
  const { start, end } = fyBounds(startYear);
  if (now.getTime() < start.getTime()) return 0;
  if (now.getTime() > end.getTime()) return 12;
  return (now.getUTCMonth() - 3 + 12) % 12;
}
