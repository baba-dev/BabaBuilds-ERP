export type NumberGap = { prefix: string; from: number; to: number; missing: number[]; missingCount: number };

/**
 * Finds holes in invoice numbering. Numbers are split into a text prefix and a trailing counter ("INV-2627-014" ->
 * "INV-2627-" + 14); each prefix is its own series. Gaps matter because GST expects every number to be accounted
 * for, either issued or cancelled.
 */
export function findNumberGaps(numbers: string[], opts: { maxReported?: number } = {}): NumberGap[] {
  const series = new Map<string, Set<number>>();
  for (const raw of numbers) {
    const m = /^(.*?)(\d+)$/.exec(raw.trim());
    if (!m) continue;
    const prefix = m[1];
    const set = series.get(prefix) ?? new Set<number>();
    set.add(Number(m[2]));
    series.set(prefix, set);
  }
  const out: NumberGap[] = [];
  for (const [prefix, set] of series) {
    if (set.size < 2) continue;
    const sorted = Array.from(set).sort((a, b) => a - b);
    const missing: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      for (let n = sorted[i - 1] + 1; n < sorted[i]; n += 1) {
        if (missing.length >= (opts.maxReported ?? 50) + 1) break;
        missing.push(n);
      }
    }
    if (missing.length > 0) out.push({ prefix, from: sorted[0], to: sorted[sorted.length - 1], missing: missing.slice(0, opts.maxReported ?? 50), missingCount: sorted[sorted.length - 1] - sorted[0] + 1 - sorted.length });
  }
  return out;
}

/** Rule 42: credit reversed on inputs used for both taxable and exempt supplies = common credit x exempt / total turnover. */
export function rule42Reversal(args: { commonCredit: number; exemptTurnover: number; totalTurnover: number }): number {
  if (args.totalTurnover <= 0 || args.commonCredit <= 0 || args.exemptTurnover <= 0) return 0;
  const ratio = Math.min(1, args.exemptTurnover / args.totalTurnover);
  return Math.round(args.commonCredit * ratio * 100) / 100;
}
