"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileText, FolderOpen, Settings2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { cn } from "@/lib/utils";

const NAV = [
  { key: "library", href: "/documents", icon: FolderOpen },
  { key: "compliance", href: "/documents/compliance", icon: ShieldCheck },
  { key: "settings", href: "/documents/settings", icon: Settings2 },
] as const;

export function DocumentsShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const t = useTranslations("DocumentsHub");
  const pathname = usePathname() ?? "";
  const active = NAV.find((n) => (n.href === "/documents" ? pathname === "/documents" : pathname.startsWith(n.href)))?.key ?? "library";
  return (
    <DashboardPageShell title={t("title")} description={t("description")} icon={<FileText className="h-5 w-5 text-sky-500" />} animated={false} pageActions={actions} maxWidthClassName="max-w-7xl">
      <div className="space-y-6">
        <nav aria-label={t("title")} className="flex gap-1 overflow-x-auto pb-1">
          {NAV.map(({ key, href, icon: Icon }) => (
            <Link key={key} href={href} aria-current={active === key ? "page" : undefined}
              className={cn("inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                active === key ? "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100" : "border-border/70 text-muted-foreground hover:bg-muted/60")}>
              <Icon className="h-4 w-4" />{t(`nav.${key}`)}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </DashboardPageShell>
  );
}
