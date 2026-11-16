"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Users2, Clock, CalendarDays, BarChart3, Settings2, LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import type { SegmentedControlOption } from "@/components/ui/segmented-control";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReactNode } from "react";

type WorkforceNavItem = {
  key: "overview" | "people" | "attendance" | "leave" | "reports" | "settings";
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const WORKFORCE_NAV: WorkforceNavItem[] = [
  { key: "overview", href: "/workforce", label: "Overview", icon: LayoutDashboard },
  { key: "people", href: "/workforce/people", label: "People", icon: Users2 },
  { key: "attendance", href: "/workforce/attendance", label: "Attendance", icon: Clock },
  { key: "leave", href: "/workforce/leave", label: "Leave", icon: CalendarDays },
  { key: "reports", href: "/workforce/reports", label: "Reports", icon: BarChart3 },
  { key: "settings", href: "/workforce/settings", label: "Settings", icon: Settings2 },
];

function activeKeyForPath(pathname: string | null) {
  if (!pathname) return "overview";
  return WORKFORCE_NAV.find((n) => pathname === n.href || (n.href !== "/workforce" && pathname.startsWith(n.href)))?.key ?? "overview";
}

export function WorkforceSubNav() {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();
  const active = activeKeyForPath(pathname);
  const t = useTranslations("WorkforceHub");

  const linkFor = (href: string) => `${href}${qs ? `?${qs}` : ""}`;

  const options: SegmentedControlOption<WorkforceNavItem["key"]>[] = WORKFORCE_NAV.map((n) => ({
    value: n.key,
    label: (
      <span className="inline-flex items-center gap-2">
        <n.icon className="h-4 w-4" />
        <span>{t(`nav.${n.key}`)}</span>
      </span>
    ),
  }));

  const groupedLabel = (item: WorkforceNavItem) => (
    <span className="inline-flex items-center gap-2">
      <item.icon className="h-4 w-4" />
      <span>{t(`nav.${item.key}`)}</span>
    </span>
  );

  return (
    <div className={cn("w-full", "pt-1")}>
      <div className="hidden md:block">
        <SegmentedControl<WorkforceNavItem["key"]>
          value={active}
          onValueChange={(next) => {
            const item = WORKFORCE_NAV.find((n) => n.key === next);
            if (!item) return;
            window.location.href = linkFor(item.href);
          }}
          options={options}
          listClassName="gap-1.5"
          itemClassName="basis-[7.5rem] grow-0"
        />
      </div>

      <div className="md:hidden">
        <Select
          value={active}
          onValueChange={(next) => {
            const item = WORKFORCE_NAV.find((n) => n.key === next);
            if (!item) return;
            window.location.href = linkFor(item.href);
          }}
        >
          <SelectTrigger className="h-10 rounded-2xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKFORCE_NAV.map((n) => (
              <SelectItem key={n.key} value={n.key}>
                {groupedLabel(n)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function WorkforcePageShell({ children, title, description, actions }: {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <DashboardPageShell
      title={title}
      description={description}
      icon={<Users2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />}
      animated={false}
      pageActions={actions}
    >
      <div className="space-y-6">
        <WorkforceSubNav />
        <div>{children}</div>
      </div>
    </DashboardPageShell>
  );
}
