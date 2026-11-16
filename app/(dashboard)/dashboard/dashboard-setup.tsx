"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DASHBOARD_ROUTES } from "./dashboard-routes";
import { ProgressBar, focusRing } from "./dashboard-ui";
import type { DashboardData, SetupStepId } from "./types";

const STEP_HREF: Record<SetupStepId, string> = {
  profile: DASHBOARD_ROUTES.profile,
  client: DASHBOARD_ROUTES.newClient,
  invoice: DASHBOARD_ROUTES.newInvoice,
  payments: DASHBOARD_ROUTES.settings,
  email: DASHBOARD_ROUTES.settings,
};

/** Shown until the workspace can bill and get paid end to end. The list and the percentage come from the same server checklist. */
export function DashboardSetup({ health }: { health: DashboardData["health"] }) {
  const t = useTranslations("DashboardHome");
  const [open, setOpen] = useState(false);
  const steps = health.setupSteps.filter((step) => step.id in STEP_HREF);
  const next = steps.find((step) => !step.done);
  if (!next) return null;
  const done = steps.filter((step) => step.done).length;

  return (
    <>
      <section aria-label={t("setup.title")} className="flex flex-col gap-3 rounded-2xl border border-orange-500/25 bg-orange-500/[0.06] p-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{t("setup.title")}</p>
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground">{t("setup.progress", { done, total: steps.length })}</p>
          </div>
          <ProgressBar value={health.setupCompletion} label={t("setup.title")} className="mt-2 bg-orange-500/15" />
          <p className="mt-2 truncate text-xs text-muted-foreground">{t("setup.next", { step: t(`setup.step.${next.id}.title`) })}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" className="h-10 flex-1 sm:h-8 sm:flex-none" onClick={() => setOpen(true)}>
            {t("setup.seeAll")}
          </Button>
          <Button asChild size="sm" className="h-10 flex-1 sm:h-8 sm:flex-none">
            <Link href={STEP_HREF[next.id]}>
              {t("setup.continue")}
              <ArrowRight className="ms-1.5 h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
            </Link>
          </Button>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("setup.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("setup.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5">
            {steps.map((step) => (
              <li key={step.id}>
                {step.done ? (
                  <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-muted-foreground line-through decoration-muted-foreground/40">{t(`setup.step.${step.id}.title`)}</span>
                    <span className="sr-only">{t("setup.done")}</span>
                  </div>
                ) : (
                  <Link
                    href={STEP_HREF[step.id]}
                    onClick={() => setOpen(false)}
                    className={cn("group flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5 transition-colors hover:bg-muted/60", focusRing)}
                  >
                    <Circle className="h-6 w-6 shrink-0 p-0.5 text-muted-foreground/50" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{t(`setup.step.${step.id}.title`)}</span>
                      <span className="block text-xs text-muted-foreground">{t(`setup.step.${step.id}.hint`)}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
