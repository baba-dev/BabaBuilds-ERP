"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlarmClock, Boxes, CheckCircle2, ChevronRight, FileCheck2, FileWarning, Landmark, ListChecks, ShieldAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DASHBOARD_ROUTES } from "./dashboard-routes";
import { Panel, focusRing, toneChipClass, type Tone } from "./dashboard-ui";
import type { DashboardData } from "./types";

type AttentionItem = { id: string; tone: Tone; icon: LucideIcon; count: number; title: string; detail: string; href: string };

const TONE_ORDER: Record<Tone, number> = { critical: 0, warning: 1, info: 2, positive: 3, neutral: 4 };

export function DashboardAttention({
  data,
  money,
  enabledModules,
}: {
  data: DashboardData;
  money: (value: number) => string;
  enabledModules: Set<string>;
}) {
  const t = useTranslations("DashboardHome");
  const { attention, receivables } = data;

  const all: AttentionItem[] = [
    {
      id: "violations",
      tone: "critical",
      icon: ShieldAlert,
      count: attention.criticalViolations,
      title: t("attention.violations.title", { count: attention.criticalViolations }),
      detail: t("attention.violations.detail"),
      href: DASHBOARD_ROUTES.reconciliation,
    },
    {
      id: "overdue",
      tone: "critical",
      icon: AlarmClock,
      count: attention.overdueReceivables,
      title: t("attention.overdue.title", { count: attention.overdueReceivables }),
      detail: t("attention.overdue.detail", { amount: money(receivables.overdueAmount) }),
      href: enabledModules.has("AR_COLLECTIONS") ? DASHBOARD_ROUTES.collections : DASHBOARD_ROUTES.overdueInvoices,
    },
    {
      id: "imports",
      tone: "warning",
      icon: FileWarning,
      count: attention.failedImports,
      title: t("attention.imports.title", { count: attention.failedImports }),
      detail: t("attention.imports.detail"),
      href: enabledModules.has("IMPORT_MANAGER") ? DASHBOARD_ROUTES.importManager : DASHBOARD_ROUTES.importSettings,
    },
    {
      id: "proposals",
      tone: "warning",
      icon: FileCheck2,
      count: attention.acceptedUninvoicedProposals,
      title: t("attention.proposals.title", { count: attention.acceptedUninvoicedProposals }),
      detail: t("attention.proposals.detail"),
      href: DASHBOARD_ROUTES.acceptedProposals,
    },
    {
      id: "bank",
      tone: "warning",
      icon: Landmark,
      count: attention.unreconciledTransactions,
      title: t("attention.bank.title", { count: attention.unreconciledTransactions }),
      detail: t("attention.bank.detail"),
      href: DASHBOARD_ROUTES.reconciliation,
    },
    {
      id: "stock",
      tone: "warning",
      icon: Boxes,
      count: attention.lowStock,
      title: t("attention.stock.title", { count: attention.lowStock }),
      detail: t("attention.stock.detail"),
      href: DASHBOARD_ROUTES.inventory,
    },
    {
      id: "tasks",
      tone: "info",
      icon: ListChecks,
      count: attention.urgentTasks,
      title: t("attention.tasks.title", { count: attention.urgentTasks }),
      detail: t("attention.tasks.detail"),
      href: DASHBOARD_ROUTES.pipeline,
    },
  ];
  const items = all.filter((item) => item.count > 0).sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);

  return (
    <Panel
      labelledBy="dash-attention"
      title={t("attention.title")}
      description={items.length ? t("attention.description") : undefined}
      action={
        items.length ? (
          <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums", toneChipClass[items[0].tone])}>
            {attention.totalUrgent}
          </span>
        ) : null
      }
      bodyClassName="px-2 pb-2 pt-2 sm:px-3 sm:pb-3"
    >
      {items.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-full", toneChipClass.positive)}>
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-medium text-foreground">{t("attention.clearTitle")}</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{t("attention.clearHint")}</p>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className={cn("group flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60 sm:px-2.5", focusRing)}
              >
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneChipClass[item.tone])}>
                  <item.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground rtl:rotate-180" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
