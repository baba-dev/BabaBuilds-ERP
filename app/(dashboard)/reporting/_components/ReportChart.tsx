"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChartSpec, Row } from "./shared";

const FILL = ["fill-indigo-500", "fill-emerald-500", "fill-amber-500", "fill-rose-500", "fill-sky-500", "fill-violet-500", "fill-teal-500", "fill-orange-500"];
const STROKE = ["stroke-indigo-500", "stroke-emerald-500", "stroke-amber-500", "stroke-rose-500", "stroke-sky-500", "stroke-violet-500", "stroke-teal-500", "stroke-orange-500"];
const BG = ["bg-indigo-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-sky-500", "bg-violet-500", "bg-teal-500", "bg-orange-500"];
const W = 860, H = 280, PAD = { l: 58, r: 12, t: 12, b: 34 };
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** One chart for every report: grouped bars with an optional line, lines, or a donut. The table below always carries the exact figures. */
export function ReportChart({ spec, rows, compact, label, seriesLabel, other }: { spec: ChartSpec; rows: Row[]; compact: (v: number) => string; label: (v: unknown) => string; seriesLabel: (k: string) => string; other: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => (spec.type === "donut" ? rows : rows.slice(0, 24)), [rows, spec.type]);

  if (spec.type === "donut") {
    const key = spec.series[0]!;
    const sorted = [...data].map((r) => ({ name: label(r[spec.labelKey]), v: Math.max(0, n(r[key])) })).sort((a, b) => b.v - a.v);
    const top = sorted.slice(0, 7), rest = sorted.slice(7).reduce((s, r) => s + r.v, 0);
    const parts = rest > 0 ? [...top, { name: other, v: rest }] : top;
    const total = parts.reduce((s, p) => s + p.v, 0) || 1;
    const starts = parts.map((_, i) => parts.slice(0, i).reduce((sum, x) => sum + x.v, 0));
    return (
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <svg viewBox="-60 -60 120 120" className="h-48 w-48 shrink-0" role="img">
          {parts.map((p, i) => {
            const a0 = ((starts[i] ?? 0) / total) * Math.PI * 2 - Math.PI / 2; const a1 = (((starts[i] ?? 0) + p.v) / total) * Math.PI * 2 - Math.PI / 2;
            const large = a1 - a0 > Math.PI ? 1 : 0; const R = 50, r = 32;
            const d = parts.length === 1 ? `M0,${-R} A${R},${R} 0 1,1 -0.01,${-R} L-0.01,${-r} A${r},${r} 0 1,0 0,${-r} Z` : `M${R * Math.cos(a0)},${R * Math.sin(a0)} A${R},${R} 0 ${large},1 ${R * Math.cos(a1)},${R * Math.sin(a1)} L${r * Math.cos(a1)},${r * Math.sin(a1)} A${r},${r} 0 ${large},0 ${r * Math.cos(a0)},${r * Math.sin(a0)} Z`;
            return <path key={p.name + i} d={d} className={cn(FILL[i % FILL.length], "stroke-background")} strokeWidth={1} />;
          })}
        </svg>
        <ul className="grid w-full flex-1 gap-1.5 text-sm">
          {parts.map((p, i) => (
            <li key={p.name + i} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", BG[i % BG.length])} /><span className="truncate">{p.name}</span></span><span className="shrink-0 tabular-nums text-muted-foreground">{compact(p.v)} · {Math.round((p.v / total) * 100)}%</span></li>
          ))}
        </ul>
      </div>
    );
  }

  const series = spec.series, lines = spec.type === "line" ? spec.series : (spec.lineSeries ?? []);
  const barSeries = spec.type === "bars" ? series : [];
  const all = [...barSeries, ...lines];
  const values = data.flatMap((r) => all.map((k) => n(r[k])));
  const lo = Math.min(0, ...values), hi = Math.max(1, ...values);
  const pad = (hi - lo) * 0.06;
  const y = (v: number) => PAD.t + (1 - (v - lo + (lo < 0 ? pad : 0)) / (hi - lo + pad + (lo < 0 ? pad : 0))) * (H - PAD.t - PAD.b);
  const slot = (W - PAD.l - PAD.r) / Math.max(1, data.length);
  const x = (i: number) => PAD.l + slot * i + slot / 2;
  const bw = Math.max(3, Math.min(34, (slot * 0.7) / Math.max(1, barSeries.length)));
  const ticks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4);
  const labelEvery = data.length > 14 ? Math.ceil(data.length / 10) : 1;
  const short = (s: string) => (s.length > 12 ? `${s.slice(0, 11)}…` : s);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" onMouseLeave={() => setHover(null)} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(data.length - 1, Math.floor((px - PAD.l) / slot)))); }}>
        {ticks.map((t) => (<g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray="2 4" /><text x={PAD.l - 8} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={10}>{compact(t)}</text></g>))}
        {lo < 0 ? <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="stroke-rose-500/60" /> : null}
        {data.map((r, i) => barSeries.map((k, si) => { const v = n(r[k]); const x0 = x(i) - (bw * barSeries.length) / 2 + si * bw; const yy = Math.min(y(v), y(0)); return <rect key={`${i}-${k}`} x={x0 + 1} y={yy} width={Math.max(1, bw - 2)} height={Math.abs(y(v) - y(0))} rx={2} className={cn(FILL[all.indexOf(k) % FILL.length], hover === i ? "opacity-100" : "opacity-80")} />; }))}
        {lines.map((k) => { const idx = all.indexOf(k); return <path key={k} d={data.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(n(r[k])).toFixed(1)}`).join(" ")} fill="none" className={STROKE[idx % STROKE.length]} strokeWidth={2.25} strokeLinejoin="round" />; })}
        {data.map((r, i) => (i % labelEvery === 0 ? <text key={i} x={x(i)} y={H - 12} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>{short(label(r[spec.labelKey]))}</text> : null))}
        {hover != null ? <rect x={PAD.l + slot * hover} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} className="fill-foreground/5" /> : null}
      </svg>
      {hover != null && data[hover] ? (
        <div className="pointer-events-none absolute top-1 z-10 w-52 rounded-xl border bg-popover/95 p-3 text-xs shadow-lg backdrop-blur" style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 104px), calc(100% - 13rem))` }}>
          <p className="mb-1 font-semibold">{label(data[hover]![spec.labelKey])}</p>
          {all.map((k, i) => <p key={k} className="flex justify-between gap-2"><span className="flex items-center gap-1.5 text-muted-foreground"><span className={cn("h-2 w-2 rounded-sm", BG[i % BG.length])} />{seriesLabel(k)}</span><span className="tabular-nums">{compact(n(data[hover]![k]))}</span></p>)}
        </div>
      ) : null}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">{all.map((k, i) => <li key={k} className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-sm", BG[i % BG.length])} />{seriesLabel(k)}</li>)}</ul>
    </div>
  );
}
