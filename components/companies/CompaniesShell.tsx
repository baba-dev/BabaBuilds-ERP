"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BarChart3, Building2, CreditCard, FileBarChart2, PlusCircle, Settings2, Users2 } from "lucide-react";
import type { ReactNode } from "react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { cn } from "@/lib/utils";

const NAV = [
  { key: "overview", href: "/companies", icon: Building2 },
  { key: "create", href: "/companies/create", icon: PlusCircle },
  { key: "team", href: "/companies/access-team", icon: Users2 },
  { key: "dashboard", href: "/companies/consolidated-dashboard", icon: BarChart3 },
  { key: "reports", href: "/companies/consolidated-reports", icon: FileBarChart2 },
  { key: "billing", href: "/companies/billing-usage", icon: CreditCard },
  { key: "settings", href: "/companies/settings", icon: Settings2 },
] as const;

export function CompaniesShell({ title, description, actions, children }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  const t = useTranslations("CompaniesHub");
  const pathname = usePathname() ?? "";
  const active = NAV.find((n) => (n.href === "/companies" ? pathname === "/companies" : pathname.startsWith(n.href)))?.key ?? "overview";
  return (
    <DashboardPageShell title={title ?? t("title")} description={description ?? t("description")} icon={<Building2 className="h-5 w-5 text-orange-500" />} animated={false} pageActions={actions} maxWidthClassName="max-w-7xl">
      <div className="space-y-6">
        <nav aria-label={t("title")} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {NAV.map(({ key, href, icon: Icon }) => (
            <Link key={key} href={href} aria-current={active === key ? "page" : undefined}
              className={cn("inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
                active === key ? "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-100" : "border-border/70 text-muted-foreground hover:bg-muted/60")}>
              <Icon className="h-4 w-4" />{t(`nav.${key}`)}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </DashboardPageShell>
  );
}

export const cardClass = "rounded-2xl border border-border/70 bg-card/90 shadow-sm";
export const inputClass = "mt-1 h-10 w-full rounded-xl border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500";
