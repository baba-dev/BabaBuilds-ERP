export type Frequency = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
export const FREQUENCIES: Frequency[] = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"];

/** The next run after `from`. Month steps keep the original day when the month is long enough, else clamp to its last day. */
export function nextRun(from: Date, frequency: Frequency, anchorDay?: number): Date {
  const d = new Date(from);
  if (frequency === "WEEKLY") { d.setUTCDate(d.getUTCDate() + 7); return d; }
  const months = frequency === "MONTHLY" ? 1 : frequency === "QUARTERLY" ? 3 : 12;
  const day = anchorDay ?? from.getUTCDate();
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target;
}

/** Every date from `start` up to and including `until`, capped so a long-idle schedule cannot flood the ledger. */
export function dueDates(start: Date, frequency: Frequency, until: Date, endDate?: Date | null, cap = 12): Date[] {
  const out: Date[] = [];
  const anchor = start.getUTCDate();
  let cur = new Date(start);
  while (cur.getTime() <= until.getTime() && out.length < cap) {
    if (endDate && cur.getTime() > endDate.getTime()) break;
    out.push(cur);
    cur = nextRun(cur, frequency, anchor);
  }
  return out;
}
