"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FilePlus2, FileSignature, Landmark, ReceiptText, Repeat, UserPlus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DASHBOARD_ROUTES } from "./dashboard-routes";
import { focusRing } from "./dashboard-ui";

type Action = { key: "newInvoice" | "recordExpense" | "newProposal" | "addClient" | "newRetainer" | "importBank"; href: string; icon: LucideIcon; primary?: boolean };

const ACTIONS: Action[] = [
  { key: "newInvoice", href: DASHBOARD_ROUTES.newInvoice, icon: FilePlus2, primary: true },
  { key: "recordExpense", href: DASHBOARD_ROUTES.expenses, icon: ReceiptText },
  { key: "newProposal", href: DASHBOARD_ROUTES.newProposal, icon: FileSignature },
  { key: "addClient", href: DASHBOARD_ROUTES.newClient, icon: UserPlus },
  { key: "newRetainer", href: DASHBOARD_ROUTES.newRetainer, icon: Repeat },
  { key: "importBank", href: DASHBOARD_ROUTES.bankImport, icon: Landmark },
];

/** The jobs people open the app to do, one tap away. Swipes sideways on a phone instead of wrapping. */
export function DashboardQuickActions() {
  const t = useTranslations("DashboardHome");
  return (
    <nav aria-label={t("actions.label")} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
      {ACTIONS.map((action) => (
        <Link
          key={action.key}
          href={action.href}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors md:h-9",
            action.primary
              ? "border-transparent bg-orange-700 text-white hover:bg-orange-800"
              : "border-border/70 bg-card text-foreground hover:border-foreground/20 hover:bg-muted/60",
            focusRing,
          )}
        >
          <action.icon className="h-4 w-4" aria-hidden />
          {t(`actions.${action.key}`)}
        </Link>
      ))}
    </nav>
  );
}
