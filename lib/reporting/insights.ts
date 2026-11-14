import type { Insight, Kpi, ReportBody, Row } from '@/lib/reporting/types';

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** Plain findings worked out from the numbers alone: no guessing and nothing leaves the server. At most four, most important first. */
export function buildInsights(body: ReportBody, previous?: Kpi[]): Insight[] {
  const out: Insight[] = [];
  const k = (key: string) => body.kpis.find((x) => x.key === key);

  // Movement against the comparison period.
  for (const cur of body.kpis) {
    const prev = previous?.find((p) => p.key === cur.key);
    if (!prev || prev.value === 0 || cur.format === 'percent') continue;
    const pct = ((cur.value - prev.value) / Math.abs(prev.value)) * 100;
    if (Math.abs(pct) < 10) continue;
    const good = cur.upGood == null ? null : (pct > 0) === cur.upGood;
    out.push({ code: pct > 0 ? 'kpiUp' : 'kpiDown', tone: good == null ? 'info' : good ? 'good' : 'bad', params: { kpi: cur.key, pct: Math.round(Math.abs(pct)) } });
  }

  // One name carrying most of the total.
  const share = body.columns.find((c) => c.key === 'share');
  if (share && body.rows.length >= 2 && !['kind', 'section', 'stage', 'side', 'status'].includes(body.columns[0]!.key)) {
    const nameKey = body.columns[0]!.key;
    const top = [...body.rows].sort((a: Row, b: Row) => n(b.share) - n(a.share))[0];
    if (top && n(top.share) >= 50) out.push({ code: 'concentration', tone: 'warn', params: { name: String(top[nameKey] ?? ''), pct: Math.round(n(top.share)) } });
  }

  const margin = k('margin') ?? k('netProfit');
  if (k('margin') && n(k('margin')!.value) < 10 && n(k('revenue')?.value) > 0) out.push({ code: 'lowMargin', tone: 'warn', params: { pct: Math.round(n(k('margin')!.value)) } });
  const net = k('net') ?? k('netProfit') ?? margin;
  if (net && net.key !== 'margin' && n(net.value) < 0) out.push({ code: 'negativeNet', tone: 'bad', params: {} });
  const out1 = k('overdue'), outstanding = k('outstanding');
  if (out1 && outstanding && n(outstanding.value) > 0 && n(out1.value) / n(outstanding.value) >= 0.4) out.push({ code: 'overdueHeavy', tone: 'warn', params: { pct: Math.round((n(out1.value) / n(outstanding.value)) * 100) } });
  const lowest = k('lowest');
  if (lowest && n(lowest.value) < 0) out.push({ code: 'cashShortfall', tone: 'bad', params: {} });

  const rank = { bad: 0, warn: 1, good: 2, info: 3 } as const;
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 4);
}

/** Last values of a column that shares the key figure's name, for a small trend line. */
export function sparkFor(kpiKey: string, body: ReportBody): number[] | undefined {
  if (body.rows.length < 3 || !body.columns.some((c) => c.key === kpiKey)) return undefined;
  return body.rows.slice(-12).map((r) => n(r[kpiKey]));
}
