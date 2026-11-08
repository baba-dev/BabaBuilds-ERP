"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle, AlertTriangle, ArrowUpRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GstIssue } from "@/lib/gst/issues";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyArt } from "./art/GstArt";
import { Section } from "./gst-utils";

const ICON = { error: AlertCircle, warning: AlertTriangle, info: Info } as const;
const TONE = {
  error: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300",
  warning: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
  info: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300",
} as const;

export function IssuesTab({ issues, loading, goto }: { issues: GstIssue[] | null; loading: boolean; goto: (tab: string) => void }) {
  const t = useTranslations("GstHub.issues");
  if (!issues) return <div className="space-y-3"><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /></div>;
  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-14 text-center">
        <EmptyArt variant="clean" /><p className="text-base font-semibold">{t("cleanTitle")}</p><p className="max-w-sm text-sm text-muted-foreground">{t("cleanBody")}</p>
      </div>
    );
  }
  return (
    <Section title={t("title")} hint={t("hint", { count: issues.length })} className={cn(loading && "opacity-60")}>
      <ul className="divide-y divide-border/50">
        {issues.map((i) => {
          const Icon = ICON[i.severity];
          const fixInSetup = i.scope === "business";
          return (
            <li key={i.id} className="flex items-start gap-3 py-3">
              <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", TONE[i.severity])}><Icon className="size-4" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t(`codes.${i.code}.title`, { name: i.name, count: i.count })}</p>
                <p className="text-xs text-muted-foreground">{t(`codes.${i.code}.fix`)}</p>
              </div>
              {fixInSetup ? (
                <button type="button" onClick={() => goto("setup")} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("fix")}<ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden /></button>
              ) : (
                <Link href={i.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("fix")}<ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden /></Link>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
