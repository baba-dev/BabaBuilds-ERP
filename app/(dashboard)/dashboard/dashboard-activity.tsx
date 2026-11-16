"use client";

import { useTranslations } from "next-intl";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative, humanizeAction } from "./dashboard-format";
import { EmptyNote, Panel } from "./dashboard-ui";
import type { DashboardData } from "./types";

const failed = (status: string) => /fail|err/i.test(status);
const warned = (status: string) => /warn/i.test(status);

/** The latest recorded actions in the workspace: who did what, and whether it worked. */
export function DashboardActivity({ activity, locale }: { activity: DashboardData["activity"]; locale: string }) {
  const t = useTranslations("DashboardHome");
  return (
    <Panel labelledBy="dash-activity" title={t("activity.title")} description={t("activity.description")}>
      {activity.length === 0 ? (
        <EmptyNote icon={History} title={t("activity.emptyTitle")} hint={t("activity.emptyHint")} />
      ) : (
        <ol className="relative space-y-3.5 before:absolute before:bottom-1.5 before:start-[5px] before:top-1.5 before:w-px before:bg-border">
          {activity.slice(0, 6).map((item) => (
            <li key={item.id} className="relative flex gap-3 ps-5">
              <span
                className={cn(
                  "absolute start-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-card",
                  failed(item.status) ? "bg-rose-500" : warned(item.status) ? "bg-amber-500" : "bg-emerald-500",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {humanizeAction(item.action)}
                  {failed(item.status) ? <span className="ms-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">{t("activity.failed")}</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.actor ? `${item.actor} · ` : ""}
                  {formatRelative(item.createdAt, locale)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
