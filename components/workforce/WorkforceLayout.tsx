"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users2, Clock, CalendarDays, BarChart3, Settings2, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const WORKFORCE_NAV = [
  { href: "/workforce",            label: "Overview",    icon: LayoutDashboard, exact: true },
  { href: "/workforce/people",     label: "People",      icon: Users2 },
  { href: "/workforce/attendance", label: "Attendance",  icon: Clock },
  { href: "/workforce/leave",      label: "Leave",       icon: CalendarDays },
  { href: "/workforce/reports",    label: "Reports",     icon: BarChart3 },
  { href: "/workforce/settings",   label: "Settings",    icon: Settings2 },
];

export function WorkforceSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b border-white/5 px-6 pb-0 pt-0 no-scrollbar">
      {WORKFORCE_NAV.map(({ href, label, icon: Icon, exact }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href) && href !== "/workforce";
        const isOverview = href === "/workforce" && pathname === "/workforce";
        const active = isActive || isOverview;

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-all whitespace-nowrap",
              active
                ? "border-teal-500 text-teal-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-600",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function WorkforcePageShell({ children, title, description, actions }: {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-50 tracking-tight">{title}</h1>
          {description && <p className="text-sm text-zinc-400 mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
        {children}
      </div>
    </div>
  );
}
