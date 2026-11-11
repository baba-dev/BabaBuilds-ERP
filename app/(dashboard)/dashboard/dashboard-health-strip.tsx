"use client";

import { ArrowRight, Zap, Clock, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardData } from "./types";
import { DashboardAIPromptBar } from "./dashboard-ai-prompt-bar";
import { DashboardTooltip } from "./dashboard-tooltip";
import { dashboardTypography as ty } from "./dashboard-typography";
import { createTranslator } from "@/lib/i18n/translator";

// --- Subcomponents ---

function SetupSection({ 
  completion, 
  isComplete, 
  t,
  onOpenDetails,
}: { 
  completion: number; 
  isComplete: boolean; 
  t: (k: string, f: string) => string;
  onOpenDetails?: () => void;
}) {
  return (
    <Card className="group relative overflow-hidden p-5 border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/50 shadow-sm transition-all">
      <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl bg-orange-500/5 dark:bg-orange-500/10 group-hover:bg-orange-500/10 dark:group-hover:bg-orange-500/20 transition-all duration-700" />
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-50/50 to-transparent dark:from-white/5 dark:to-transparent pointer-events-none" />

      <div className="relative z-10 flex flex-col h-full justify-between gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-500/20 shadow-sm">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold tracking-wider uppercase inline-flex items-center gap-1.5">
                {t("workspace_setup", "Workspace setup")}
                <DashboardTooltip
                  label={t(
                    "workspace_setup_help",
                    "This tracks your first-run setup health. Complete profile, clients, and services to reach 100% and unlock smoother guidance.",
                  )}
                />
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium leading-tight mt-0.5">
                {isComplete
                  ? t("setup_status_complete", "Your workspace is ready.")
                  : t("setup_status_incomplete", "Finish setup to unlock full value.")}
              </p>
            </div>
          </div>
          <p className="text-3xl font-light tracking-tight tabular-nums text-zinc-900 dark:text-white">
            {completion}%
          </p>
        </div>

        <div className="space-y-3">
          <div className="h-2 w-full bg-zinc-200/60 dark:bg-zinc-800/80 rounded-full overflow-hidden shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, completion))}%` }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="h-full bg-orange-600 dark:bg-orange-500 rounded-full"
            />
          </div>

          {!isComplete && (
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenDetails}
              className="w-full h-9 justify-between text-[11px] font-bold uppercase tracking-wider border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/40 hover:bg-orange-50/60 dark:hover:bg-orange-500/10 hover:border-orange-200/70 dark:hover:border-orange-500/30 transition-colors"
            >
              <span className="inline-flex w-full items-center justify-between">
                {t("continue_setup", "Continue setup")}
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Button>
          )}

          {isComplete && (
            <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="font-medium">{t("setup_complete_short", "Setup complete")}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function SubscriptionSection({ 
  state, 
  tier, 
  t 
}: { 
  state: string; 
  tier: string; 
  t: (k: string, f: string) => string;
}) {
  return (
    <Card className="group relative overflow-hidden p-5 border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/50 shadow-sm transition-all">
      <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl bg-zinc-500/5 dark:bg-white/5 group-hover:bg-orange-500/5 dark:group-hover:bg-orange-500/10 transition-all duration-700" />
      <div className="relative z-10 space-y-4">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold tracking-wider uppercase text-zinc-500 dark:text-zinc-400">
            {t("subscription", "Subscription")}
          </p>
          <DashboardTooltip label={t("subscription_help", "Shows current billing state and plan tier.")} />
        </div>

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <p className="text-2xl font-light tracking-tight text-zinc-900 dark:text-white">
              {tier.toUpperCase()}
            </p>
            <Badge
              variant="outline"
              className="h-5 text-[11px] font-bold uppercase tracking-wider border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-50/40 dark:bg-zinc-900/40 text-zinc-500 dark:text-zinc-400"
            >
              {state}
            </Badge>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-2 font-medium">
            <Clock className="w-3.5 h-3.5 text-orange-500/50" />
            {t("active_billing", "Billing cycle active")}
          </p>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 px-3 text-[11px] font-bold uppercase tracking-wider border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/40 hover:bg-orange-50 dark:hover:bg-orange-500/10"
          >
            <Link href="/settings/billing">
              {t("open_billing", "Open billing")}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

// (Deleted IntegrationSection and ComplianceSection as they are replaced by DashboardAIPromptBar)

// --- Main Layout ---

export function DashboardHealthStrip({
  health,
  onOpenSetupDetails,
}: {
  health: DashboardData["health"];
  onOpenSetupDetails?: () => void;
}) {
  const t = useTranslations("Dashboard");
  const tr = createTranslator(t);

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2 px-1">
        <Zap className="w-5 h-5 text-orange-500" />
        <h3 className={ty.sectionTitle}>{tr("dashboard_status", "Dashboard status")}</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_2fr] gap-5">
        <SetupSection completion={health.setupCompletion} isComplete={health.setupComplete} t={tr} onOpenDetails={onOpenSetupDetails} />
        <SubscriptionSection tier={health.planTier} state={health.subscriptionState} t={tr} />

        <Card className="group relative overflow-hidden p-5 border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/50 shadow-sm">
          <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl bg-orange-500/5 dark:bg-orange-500/10 group-hover:bg-orange-500/10 dark:group-hover:bg-orange-500/20 transition-all duration-700" />
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-50/40 to-transparent dark:from-white/5 dark:to-transparent pointer-events-none" />
          <div className="relative z-10">
            <DashboardAIPromptBar />
          </div>
        </Card>
      </div>
    </section>
  );
}
