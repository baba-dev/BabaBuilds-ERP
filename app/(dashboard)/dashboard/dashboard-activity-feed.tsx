"use client";

import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";
import type { DashboardData } from "./types";
import { dashboardTypography as ty } from "./dashboard-typography";

export function DashboardActivityFeed({ activity }: { activity: DashboardData["activity"] }) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: any) => {
    const translation = t(key as any, values);
    if (translation === key || translation === `Dashboard.${key}`) return fallback;
    return translation;
  };
  return (
    <Card className="p-4 border-zinc-200 dark:border-zinc-800">
      <p className={ty.sectionTitle}>{tr("recent_activity", "Recent activity")}</p>
      <div className="mt-3 space-y-2">
        {activity.length === 0 ? (
          <p className={ty.helper}>{tr("no_recent_activity", "No recent activity yet.")}</p>
        ) : (
          activity.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2.5">
              <p className={ty.cardTitle}>{item.action}</p>
              <p className={ty.helperXs}>
                {item.status} · {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
              </p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
