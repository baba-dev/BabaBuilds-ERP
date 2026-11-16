"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Lock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "critical" | "warning" | "info" | "positive" | "neutral";

/** Soft tinted chip (icon wells, count badges). */
export const toneChipClass: Record<Tone, string> = {
  critical: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  info: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  positive: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  neutral: "bg-muted text-muted-foreground",
};

export const toneTextClass: Record<Tone, string> = {
  critical: "text-rose-600 dark:text-rose-400",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-orange-600 dark:text-orange-400",
  positive: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-muted-foreground",
};

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  labelledBy,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  labelledBy: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn("flex min-w-0 flex-col rounded-2xl border border-border/70 bg-card text-card-foreground shadow-xs", className)}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 id={labelledBy} className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("@container flex-1 px-4 pb-4 pt-3 sm:px-5 sm:pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "group/link -my-1 -me-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-9",
        focusRing,
      )}
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/link:translate-x-0.5 rtl:rotate-180" aria-hidden />
    </Link>
  );
}

/** Change against the comparison period. `goodWhenDown` flips the colour for costs. */
export function Delta({ value, label, goodWhenDown = false }: { value: number | null; label?: string; goodWhenDown?: boolean }) {
  if (value === null) return null;
  const flat = value === 0;
  const up = value > 0;
  const good = flat ? null : up !== goodWhenDown;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
        good === null ? toneChipClass.neutral : good ? toneChipClass.positive : toneChipClass.critical,
      )}
    >
      {flat ? null : <Icon className="h-3 w-3" aria-hidden />}
      {up ? "+" : ""}
      {value}%{label ? <span className="sr-only"> {label}</span> : null}
    </span>
  );
}

export function EmptyNote({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col items-center justify-center px-4 py-5 text-center sm:py-8", className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {hint ? <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Shown in place of data the member's role does not include. Nothing is fetched or blurred behind it. */
export function LockedNote({ title, hint, className }: { title: ReactNode; hint: ReactNode; className?: string }) {
  return <EmptyNote icon={Lock} title={title} hint={hint} className={className} />;
}

/** Tiny trend line. Decorative: the figures it draws are stated in text next to it. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2 || values.every((v) => v === values[0])) {
    return <div className={cn("h-9", className)} aria-hidden />;
  }
  const width = 120;
  const height = 36;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => [i * step, height - pad - ((v - min) / span) * (height - pad * 2)] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn("h-9 w-full", className)} aria-hidden>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill="currentColor" opacity={0.1} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ProgressBar({ value, tone = "info", className, label }: { value: number; tone?: Tone; className?: string; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const fill: Record<Tone, string> = {
    critical: "bg-rose-500",
    warning: "bg-amber-500",
    info: "bg-orange-500",
    positive: "bg-emerald-500",
    neutral: "bg-muted-foreground/50",
  };
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", fill[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
