"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ExplainDoc, ExplainKey } from "@/lib/gst/explain";
import { useJson, useMoney } from "./gst-utils";

const NOTE_KINDS = new Set(["DEBIT", "AMENDMENT", "ADVANCE", "ADVANCE_ADJUSTED", "HELD", "RULE_37"]);

type Scope = { period?: string; fy?: string };

/** A figure that opens "why is this number what it is": the documents behind it. */
export function Explain({ k, scope, children, className }: { k: ExplainKey; scope: Scope; children: React.ReactNode; className?: string }) {
  const t = useTranslations("GstHub.explain");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={t("hint")} className={cn("cursor-pointer rounded-sm underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 transition-colors hover:text-indigo-600 hover:decoration-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-indigo-300", className)}>
        {children}
      </button>
      {open ? <ExplainSheet k={k} scope={scope} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ExplainSheet({ k, scope, onClose }: { k: ExplainKey; scope: Scope; onClose: () => void }) {
  const t = useTranslations("GstHub.explain");
  const { n } = useMoney();
  const qs = new URLSearchParams({ key: k, ...(scope.period ? { period: scope.period } : {}), ...(scope.fy && !scope.period ? { fy: scope.fy } : {}) });
  const { data, loading, error } = useJson<{ items: ExplainDoc[]; total: number }>(`/api/gst/explain?${qs.toString()}`);
  const taxable = data?.items.reduce((s, i) => s + i.taxable, 0) ?? 0;
  const tax = data?.items.reduce((s, i) => s + i.tax, 0) ?? 0;
  return (
    <Sheet open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t(`keys.${k}`)}</SheetTitle>
          <SheetDescription>{t(`why.${k}`)}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {loading && !data ? <><Skeleton className="h-14 rounded-xl" /><Skeleton className="h-14 rounded-xl" /></> : null}
          {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}
          {data && data.items.length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t("empty")}</p> : null}
          {data && data.items.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-3 text-xs">
                <div><p className="text-muted-foreground">{t("documents")}</p><p className="text-sm font-semibold tabular-nums">{data.total}</p></div>
                <div><p className="text-muted-foreground">{t("taxable")}</p><p className="text-sm font-semibold tabular-nums">{n(taxable)}</p></div>
                <div><p className="text-muted-foreground">{t("tax")}</p><p className="text-sm font-semibold tabular-nums">{n(tax)}</p></div>
              </div>
              <ul className="divide-y divide-border/50">
                {data.items.map((i) => (
                  <li key={`${i.kind}-${i.id}`} className="py-2.5">
                    <Link href={i.href} className="group flex items-start gap-3 rounded-lg px-1 py-0.5 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium">{i.number}<span className="rounded bg-muted px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">{t(`kind.${i.kind}`)}</span>{i.note ? <span className="text-xs text-muted-foreground">· {NOTE_KINDS.has(i.note) ? t(`noteKind.${i.note}`) : i.note}</span> : null}</span>
                        <span className="block truncate text-xs text-muted-foreground">{i.party} · {i.date}</span>
                      </span>
                      <span className="text-end text-xs tabular-nums"><span className="block font-semibold">{n(i.tax)}</span><span className="block text-muted-foreground">{n(i.taxable)}</span></span>
                      <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-indigo-500 rtl:-scale-x-100" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
              {data.total > data.items.length ? <p className="text-xs text-muted-foreground">{t("truncated", { shown: data.items.length, total: data.total })}</p> : null}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
