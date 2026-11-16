"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { DASHBOARD_ROUTES, invoiceRoute } from "./dashboard-routes";
import { EmptyNote, Panel, PanelLink, focusRing } from "./dashboard-ui";
import type { AgingBucket, DashboardData } from "./types";

const BUCKET_COLOR: Record<AgingBucket, string> = {
  not_due: "bg-emerald-500/70",
  "1_30": "bg-amber-400",
  "31_60": "bg-orange-500",
  "61_plus": "bg-rose-500",
};

/** Who owes money and how late it is: an aging split plus the balances to chase first. */
export function DashboardReceivables({
  receivables,
  money,
  hasCollections,
}: {
  receivables: DashboardData["receivables"];
  money: (value: number) => string;
  hasCollections: boolean;
}) {
  const t = useTranslations("DashboardHome");
  const total = receivables.aging.reduce((sum, row) => sum + row.value, 0);

  return (
    <Panel
      labelledBy="dash-receivables"
      title={t("receivables.title")}
      description={t("receivables.description")}
      action={
        <PanelLink href={hasCollections ? DASHBOARD_ROUTES.collections : DASHBOARD_ROUTES.invoices}>
          {hasCollections ? t("receivables.openCollections") : t("receivables.openInvoices")}
        </PanelLink>
      }
    >
      {total <= 0 ? (
        <EmptyNote icon={BadgeCheck} title={t("receivables.emptyTitle")} hint={t("receivables.emptyHint")} />
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
              {receivables.aging.filter((row) => row.value > 0).map((row) => (
                <span key={row.bucket} className={cn("h-full rounded-full", BUCKET_COLOR[row.bucket])} style={{ width: `${(row.value / total) * 100}%` }} />
              ))}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 @md:grid-cols-4">
              {receivables.aging.map((row) => (
                <div key={row.bucket} className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", BUCKET_COLOR[row.bucket])} aria-hidden />
                    <span className="truncate">{t(`receivables.bucket.${row.bucket}`)}</span>
                  </dt>
                  <dd className={cn("mt-0.5 truncate text-sm font-semibold tabular-nums", row.value > 0 ? "text-foreground" : "text-muted-foreground")}>{money(row.value)}</dd>
                </div>
              ))}
            </dl>
          </div>

          {receivables.watchlist.length ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("receivables.chaseFirst")}</p>
              <ul className="-mx-2 mt-1.5 space-y-0.5">
                {receivables.watchlist.map((row) => (
                  <li key={row.id}>
                    <Link href={invoiceRoute(row.id)} className={cn("flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60", focusRing)}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{row.clientName || row.invoiceNumber}</span>
                        <span className="block truncate text-xs text-muted-foreground">{row.invoiceNumber}</span>
                      </span>
                      <span className="shrink-0 text-end">
                        <span className="block text-sm font-semibold tabular-nums text-foreground">{money(row.outstanding)}</span>
                        <span className={cn("block text-xs", row.daysOverdue > 0 ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                          {row.daysOverdue > 0 ? t("receivables.daysOverdue", { count: row.daysOverdue }) : row.daysOverdue === 0 ? t("receivables.dueToday") : t("receivables.dueIn", { count: -row.daysOverdue })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
