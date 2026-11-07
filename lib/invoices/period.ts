/** Financial-year helpers (April–March, labels like "26-27"). All boundaries are UTC. */

export type PeriodRange = { from: Date; to: Date; label: string };

const FY_LABEL = /^(\d{2})-(\d{2})$/;

export function fyLabelFor(date: Date): string {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const start = month <= 3 ? year - 1 : year;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

/** [from, to) for a label like "26-27", or null if the label is malformed/inconsistent. */
export function fyRangeFromLabel(label: string): { from: Date; to: Date } | null {
  const match = FY_LABEL.exec(label);
  if (!match) return null;
  const start = 2000 + Number(match[1]);
  const end = 2000 + Number(match[2]);
  if (end !== start + 1) return null;
  return { from: new Date(Date.UTC(start, 3, 1)), to: new Date(Date.UTC(start + 1, 3, 1)) };
}

export function previousPeriod(range: { from: Date; to: Date }): { from: Date; to: Date } {
  const length = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - length), to: new Date(range.from.getTime()) };
}

export function resolvePeriod(input: { fy?: string | null; from?: Date | null; to?: Date | null }, now = new Date()): PeriodRange {
  if (input.from && input.to && input.from < input.to) {
    return { from: input.from, to: input.to, label: "custom" };
  }
  const label = input.fy && fyRangeFromLabel(input.fy) ? input.fy : fyLabelFor(now);
  const range = fyRangeFromLabel(label)!;
  return { ...range, label };
}
