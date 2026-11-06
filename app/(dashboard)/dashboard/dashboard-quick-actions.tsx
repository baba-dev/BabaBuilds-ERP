"use client";

import Link from "next/link";
import { ArrowRight, FilePlus2, Receipt, ShoppingBag, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { dashboardTypography as ty } from "./dashboard-typography";
import { createTranslator } from "@/lib/i18n/translator";


export function DashboardQuickActions() {
  const t = useTranslations("Dashboard");
  const tr = createTranslator(t);

  const actions = [
    { href: "/invoice", label: tr("action_create_invoice", "Create invoice"), icon: FilePlus2 },
    { href: "/proposals", label: tr("action_draft_proposal", "Draft proposal"), icon: Receipt },
    { href: "/shop", label: tr("action_open_shop", "Open shop"), icon: ShoppingBag },
    { href: "/reconciliation", label: tr("action_integrity_check", "Run integrity check"), icon: Shield },
  ];

  return (
    <Card className="p-4 border-zinc-200 dark:border-zinc-800">
      <p className={ty.sectionTitle}>{tr("quick_actions", "Quick actions")}</p>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex items-center justify-between rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
          >
            <span className={ty.cardTitle}>
              <span className="inline-flex items-center gap-2">
                <action.icon className="w-4 h-4 text-orange-500" /> {action.label}
              </span>
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
          </Link>
        ))}
      </div>
    </Card>
  );
}
