"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DashboardData } from "./types";

const toneClass: Record<DashboardData["attention"]["cards"][number]["tone"], string> = {
  critical: "border-rose-300/50 bg-rose-50/70 dark:bg-rose-950/20",
  warning: "border-amber-300/50 bg-amber-50/70 dark:bg-amber-950/20",
  info: "border-indigo-300/50 bg-indigo-50/70 dark:bg-indigo-950/20",
};

export function DashboardAttentionCenter({ attention }: { attention: DashboardData["attention"] }) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string) => { try { return t(key as any); } catch { return fallback; } };
  return (
    <Card className="p-5 md:p-6 border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-indigo-50/80 to-white dark:from-zinc-900 dark:to-zinc-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.14em] uppercase text-zinc-500">{tr("attention_center", "Attention center")}</p>
          <h2 className="text-2xl md:text-3xl font-bold mt-1">{attention.totalUrgent} {tr("items_need_action", "items need action")}</h2>
          <p className="text-sm text-zinc-500 mt-1">{tr("attention_center_desc", "Prioritized by urgency across finance, compliance, and operations.")}</p>
        </div>
        <div className="inline-flex h-9 w-9 rounded-full items-center justify-center bg-rose-500/10 text-rose-600">
          <AlertTriangle className="w-5 h-5" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-5">
        {attention.cards.map((card) => (
          <div key={card.id} className={`rounded-xl border p-3 ${toneClass[card.tone]} transition-transform hover:-translate-y-0.5`}>
            <p className="text-xs uppercase tracking-wider text-zinc-500">{card.title}</p>
            <p className="text-2xl font-bold mt-1">{card.value}</p>
            <p className="text-xs text-zinc-500 mt-1">{card.helper}</p>
            {card.href && (
              <Button asChild variant="link" className="px-0 h-auto mt-1 text-xs">
                <Link href={card.href}>Open <ArrowRight className="ml-1 w-3 h-3" /></Link>
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 text-xs text-zinc-600">
        <span className="inline-flex items-center gap-1"><CircleAlert className="w-3.5 h-3.5" /> Pending invoices: {attention.pendingInvoices}</span>
        <span className="inline-flex items-center gap-1"><Bell className="w-3.5 h-3.5" /> Critical notifications: {attention.criticalNotifications}</span>
        <span>Retainers due soon: {attention.retainersDueSoon}</span>
        <span>Failed imports: {attention.failedImports}</span>
      </div>
    </Card>
  );
}
