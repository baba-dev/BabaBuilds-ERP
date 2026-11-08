"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Proposals list and the pipeline analytics are two views of the same funnel. */
export function ProposalsTabs() {
  const t = useTranslations("ProposalsHub");
  const pathname = usePathname();
  const tabs = [
    { href: "/proposals", label: t("tabs.proposals"), active: pathname === "/proposals" },
    { href: "/proposals/pipeline", label: t("tabs.pipeline"), active: pathname.startsWith("/proposals/pipeline") },
  ];
  return (
    <nav aria-label={t("tabs.label")} className="inline-flex rounded-xl border border-border/70 bg-muted/40 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            tab.active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
