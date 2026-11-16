"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ROUTES } from "./dashboard-routes";
import { daysUntil, formatMonthLabel } from "./dashboard-format";
import { EmptyNote, Panel, PanelLink, focusRing } from "./dashboard-ui";
import type { DashboardData } from "./types";

/** What is due in the next two weeks across invoices, retainers and tax, soonest first. */
export function DashboardAgenda({ upcoming, money, locale }: { upcoming: DashboardData["upcoming"]; money: (value: number) => string; locale: string }) {
  const t = useTranslations("DashboardHome");

  const when = (date: string) => {
    const days = daysUntil(date);
    if (days <= 0) return t("agenda.today");
    if (days === 1) return t("agenda.tomorrow");
    return t("agenda.inDays", { count: days });
  };

  return (
    <Panel
      labelledBy="dash-agenda"
      title={t("agenda.title")}
      description={t("agenda.description")}
      action={<PanelLink href={DASHBOARD_ROUTES.retainers}>{t("agenda.retainers")}</PanelLink>}
      bodyClassName="px-2 pb-2 pt-2 sm:px-3 sm:pb-3"
    >
      {upcoming.length === 0 ? (
        <EmptyNote
          icon={CalendarClock}
          title={t("agenda.emptyTitle")}
          hint={t("agenda.emptyHint")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={DASHBOARD_ROUTES.newRetainer}>{t("agenda.emptyAction")}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-0.5">
          {upcoming.map((item) => {
            const date = new Date(item.date);
            const soon = daysUntil(item.date) <= 1;
            return (
              <li key={`${item.kind}-${item.id}`}>
                <Link href={item.href} className={cn("group flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60 sm:px-2.5", focusRing)}>
                  <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border border-border/70 bg-muted/40 leading-none">
                    <span className="text-[10px] font-medium uppercase text-muted-foreground">{formatMonthLabel(`${date.getFullYear()}-${date.getMonth() + 1}`, locale)}</span>
                    <span className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{date.getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{item.title || item.reference}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t(`agenda.kind.${item.kind}`)}
                      {item.title && item.reference ? ` · ${item.reference}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    {item.amount !== null ? <span className="block text-sm font-semibold tabular-nums text-foreground">{money(item.amount)}</span> : null}
                    <span className={cn("block text-xs", soon ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{when(item.date)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
