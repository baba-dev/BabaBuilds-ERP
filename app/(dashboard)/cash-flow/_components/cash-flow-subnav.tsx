"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AreaChart, Bell, SlidersHorizontal, TrendingDown, TrendingUp, Wand2, BarChart3, Settings2 } from "lucide-react";
import type { SegmentedControlOption } from "@/components/ui/segmented-control";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type NavItem = {
  key: string;
  href: string;
  label: string;
  group: "ops" | "model";
  icon: React.ComponentType<{ className?: string }>;
};

const nav: NavItem[] = [
  { key: "overview", href: "/cash-flow/overview", label: "Overview", group: "ops", icon: AreaChart },
  { key: "inflows", href: "/cash-flow/inflows", label: "Inflows", group: "ops", icon: TrendingUp },
  { key: "outflows", href: "/cash-flow/outflows", label: "Outflows", group: "ops", icon: TrendingDown },
  { key: "variance", href: "/cash-flow/variance", label: "Variance", group: "ops", icon: BarChart3 },
  { key: "alerts", href: "/cash-flow/alerts", label: "Alerts", group: "ops", icon: Bell },
  { key: "scenarios", href: "/cash-flow/scenarios", label: "Scenarios", group: "model", icon: SlidersHorizontal },
  { key: "assumptions", href: "/cash-flow/assumptions", label: "Assumptions", group: "model", icon: Settings2 },
];

function activeKeyForPath(pathname: string | null) {
  if (!pathname) return "overview";
  return nav.find((n) => pathname.startsWith(n.href))?.key ?? "overview";
}

export function CashFlowSubnav({ className }: { className?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();
  const active = activeKeyForPath(pathname);

  const linkFor = (href: string) => `${href}${qs ? `?${qs}` : ""}`;

  const options: SegmentedControlOption<NavItem["key"]>[] = nav.map((n) => ({
    value: n.key as NavItem["key"],
    label: (
      <span className="inline-flex items-center gap-2">
        <n.icon className="h-4 w-4" />
        <span>{n.label}</span>
      </span>
    ),
  }));

  const groupedLabel = (item: NavItem) => (
    <span className="inline-flex items-center gap-2">
      <item.icon className="h-4 w-4" />
      <span>{item.label}</span>
    </span>
  );

  const ops = nav.filter((n) => n.group === "ops");
  const model = nav.filter((n) => n.group === "model");

  return (
    <div className={cn("w-full", className)}>
      {/* Desktop segmented nav */}
      <div className="hidden md:block">
        <SegmentedControl<NavItem["key"]>
          value={active as NavItem["key"]}
          onValueChange={(next) => {
            const item = nav.find((n) => n.key === next);
            if (!item) return;
            window.location.href = linkFor(item.href);
          }}
          options={options}
          listClassName="gap-1.5"
          itemClassName="basis-[7.5rem] grow-0"
        />
        <div className="mt-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-2">
            <Wand2 className="h-3.5 w-3.5" />
            Operations
          </span>
          <span className="inline-flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5" />
            Modeling
          </span>
        </div>
      </div>

      {/* Mobile: compact switcher */}
      <div className="md:hidden">
        <Select
          value={active}
          onValueChange={(next) => {
            const item = nav.find((n) => n.key === next);
            if (!item) return;
            window.location.href = linkFor(item.href);
          }}
        >
          <SelectTrigger className="h-10 rounded-2xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <div className="px-2 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Operations
            </div>
            {ops.map((n) => (
              <SelectItem key={n.key} value={n.key}>
                {groupedLabel(n)}
              </SelectItem>
            ))}
            <div className="px-2 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Modeling
            </div>
            {model.map((n) => (
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

