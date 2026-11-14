"use client";

import { useMemo, useState } from "react";
import { compact, periodLabel, type Horizon, type ScenarioRow } from "./shared";
import { cn } from "@/lib/utils";

type Series = { rows: ScenarioRow; tone: "base" | "best" | "worst" | "custom" };

const W = 860;
const H = 280;
const PAD = { l: 56, r: 12, t: 14, b: 26 };
/** Height kept at the bottom for the money in/out bars, so they never sit on top of the balance line. */
const BARS = 54;

/** Balance line for one scenario with the best/worst range shaded behind it, the cash cushion and zero marked, and money in/out as bars underneath. */
export function CashChart({ selected, range, threshold, horizon, locale, currency, labels, extraLine }: {
  selected: ScenarioRow; range?: { best: ScenarioRow; worst: ScenarioRow }; threshold: number; horizon: Horizon; locale: string; currency: string;
  labels: { balance: string; cushion: string; inflow: string; outflow: string; range: string; zero: string; compare?: string };
  extraLine?: Series | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const periods = selected.periods;
  const n = periods.length;

  const geo = useMemo(() => {
    const vals: number[] = [threshold, 0];
    for (const s of [selected, range?.best, range?.worst, extraLine?.rows]) if (s) for (const p of s.periods) vals.push(p.closing, p.lowest);
    const min = Math.min(...vals), max = Math.max(...vals);
    const pad = (max - min || 1) * 0.08;
    const lo = min - pad, hi = max + pad;
    const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r));
    const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b - BARS);
    const ticks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4);
    return { x, y, ticks, lo, hi };
  }, [selected, range, extraLine, threshold, n]);

  const path = (rows: ScenarioRow) => rows.periods.map((p, i) => `${i ? "L" : "M"}${geo.x(i).toFixed(1)},${geo.y(p.closing).toFixed(1)}`).join(" ");
  const band = range && n > 1
    ? `${range.best.periods.map((p, i) => `${i ? "L" : "M"}${geo.x(i).toFixed(1)},${geo.y(p.closing).toFixed(1)}`).join(" ")} ${[...range.worst.periods].reverse().map((p, k) => `L${geo.x(n - 1 - k).toFixed(1)},${geo.y(p.closing).toFixed(1)}`).join(" ")} Z`
    : null;

  const maxFlow = Math.max(1, ...periods.map((p) => Math.max(p.actualIn + p.projectedIn, p.actualOut + p.projectedOut)));
  const barW = Math.max(3, Math.min(26, ((W - PAD.l - PAD.r) / Math.max(n, 1)) * 0.55));
  const barBase = H - PAD.b;
  const barMax = BARS - 8;
  const h = hover != null ? periods[hover] : null;
  const labelEvery = n > 16 ? Math.ceil(n / 8) : n > 8 ? 2 : 1;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" role="img" aria-label={labels.balance}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1)))));
        }}>
        {geo.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(t)} y2={geo.y(t)} className="stroke-border" strokeWidth={1} strokeDasharray="2 4" />
            <text x={PAD.l - 8} y={geo.y(t) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={10}>{compact(t, locale, currency)}</text>
          </g>
        ))}
        {geo.lo < 0 && geo.hi > 0 ? <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(0)} y2={geo.y(0)} className="stroke-rose-500/70" strokeWidth={1.25} /> : null}
        {threshold > 0 ? <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(threshold)} y2={geo.y(threshold)} className="stroke-amber-500" strokeWidth={1.25} strokeDasharray="5 4" /> : null}
        {band ? <path d={band} className="fill-primary/10" /> : null}
        {periods.map((p, i) => {
          const inH = ((p.actualIn + p.projectedIn) / maxFlow) * barMax;
          const outH = ((p.actualOut + p.projectedOut) / maxFlow) * barMax;
          return (
            <g key={p.start}>
              <rect x={geo.x(i) - barW - 0.5} y={barBase - inH} width={barW} height={Math.max(0, inH)} rx={1.5} className="fill-emerald-500/40" />
              <rect x={geo.x(i) + 0.5} y={barBase - outH} width={barW} height={Math.max(0, outH)} rx={1.5} className="fill-rose-500/40" />
              {i % labelEvery === 0 ? <text x={geo.x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>{periodLabel(p, horizon, locale).split(" – ")[0]}</text> : null}
            </g>
          );
        })}
        {extraLine ? <path d={path(extraLine.rows)} fill="none" className="stroke-violet-500" strokeWidth={2.25} strokeDasharray="6 3" strokeLinejoin="round" /> : null}
        <path d={path(selected)} fill="none" className="stroke-primary" strokeWidth={2.75} strokeLinejoin="round" strokeLinecap="round" />
        {periods.map((p, i) => (
          <circle key={`d-${p.start}`} cx={geo.x(i)} cy={geo.y(p.closing)} r={hover === i ? 5 : p.risk === "CRITICAL" || p.risk === "HIGH" ? 3.5 : 0} className={cn(p.risk === "CRITICAL" ? "fill-rose-500" : p.risk === "HIGH" ? "fill-amber-500" : "fill-primary", "stroke-background")} strokeWidth={2} />
        ))}
        {hover != null ? <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.t} y2={barBase} className="stroke-foreground/20" strokeWidth={1} /> : null}
      </svg>

      {h ? (
        <div className="pointer-events-none absolute top-2 z-10 w-52 rounded-xl border bg-popover/95 p-3 text-xs shadow-lg backdrop-blur" style={{ left: `clamp(0px, calc(${(geo.x(hover!) / W) * 100}% - 104px), calc(100% - 13rem))` }}>
          <p className="font-semibold">{periodLabel(h, horizon, locale)}</p>
          <dl className="mt-1.5 space-y-1 tabular-nums">
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{labels.balance}</dt><dd className="font-medium">{compact(h.closing, locale, currency)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{labels.inflow}</dt><dd className="text-emerald-600 dark:text-emerald-400">{compact(h.actualIn + h.projectedIn, locale, currency)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{labels.outflow}</dt><dd className="text-rose-600 dark:text-rose-400">{compact(h.actualOut + h.projectedOut, locale, currency)}</dd></div>
            {extraLine?.rows.periods[hover!] ? <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{labels.compare}</dt><dd className="text-violet-600 dark:text-violet-400">{compact(extraLine.rows.periods[hover!]!.closing, locale, currency)}</dd></div> : null}
          </dl>
        </div>
      ) : null}

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-primary" />{labels.balance}</li>
        {range ? <li className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-primary/15" />{labels.range}</li> : null}
        {threshold > 0 ? <li className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-amber-500" />{labels.cushion}</li> : null}
        {extraLine ? <li className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-violet-500" />{labels.compare}</li> : null}
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500/50" />{labels.inflow}</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-rose-500/50" />{labels.outflow}</li>
      </ul>
    </div>
  );
}
