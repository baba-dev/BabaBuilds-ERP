"use client";

import { useState } from "react";
import { 
  ShieldCheck, 
  Sparkles, 
  ShieldAlert, 
  Link as LinkIcon, 
  ArrowRight, 
  Settings, 
  Zap, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  Clock
} from "lucide-react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardData, IntegrationStatus } from "./types";
import { DashboardTooltip } from "./dashboard-tooltip";

// --- Subcomponents ---

function SetupSection({ 
  completion, 
  isComplete, 
  t 
}: { 
  completion: number; 
  isComplete: boolean; 
  t: (k: string, f: string) => string;
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl p-5 bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/20 shadow-sm"
    >
      {/* Subtle Sheen Animation */}
      <motion.div 
        initial={{ left: "-100%" }}
        animate={{ left: "100%" }}
        transition={{ duration: 1.5, delay: 0.5, ease: "easeInOut" }}
        className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/20 dark:via-white/5 to-transparent skew-x-12"
      />

      <div className="relative z-10 flex flex-col h-full justify-between gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
              <Zap className="w-4 h-4" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-900/60 dark:text-indigo-400/80">
              {t("workspace_setup", "Workspace setup")}
            </p>
          </div>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{completion}%</p>
        </div>

        <div className="space-y-2">
          <div className="h-2 w-full bg-indigo-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${completion}%` }}
              transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
              className="h-full bg-indigo-600 dark:bg-indigo-500"
            />
          </div>
          <p className="text-xs text-indigo-800/70 dark:text-zinc-400 font-medium leading-relaxed">
            {isComplete 
              ? t("setup_status_complete", "Your workspace is fully optimized and ready.")
              : t("setup_status_incomplete", "Complete a few more steps to unlock full potential.")}
          </p>
        </div>

        {!isComplete && (
          <Button 
            asChild 
            size="sm" 
            variant="ghost" 
            className="w-full mt-1 justify-between group hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold border border-transparent hover:border-indigo-200 dark:hover:border-indigo-500/30"
          >
            <Link href="/onboarding">
              {t("continue_setup", "Continue setup")}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        )}
      </div>
    </motion.div>
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
    <div className="p-1">
      <div className="flex items-center gap-1 mb-3">
        <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          {t("subscription", "Subscription")}
        </p>
        <DashboardTooltip label={t("subscription_help", "Shows current billing state and plan tier.")} />
      </div>
      
      <div className="space-y-1">
        <div className="flex items-baseline gap-2">
          <p className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-100">
            {tier.toUpperCase()}
          </p>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-zinc-200 dark:border-zinc-800 text-zinc-500">
            {state}
          </Badge>
        </div>
        <p className="text-xs text-zinc-500 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {t("active_billing", "Billing cycle active")}
        </p>
      </div>
    </div>
  );
}

function IntegrationSection({ 
  readiness, 
  t 
}: { 
  readiness: DashboardData["health"]["integrationReadiness"];
  t: (k: string, f: string) => string;
}) {
  const [activeTab, setActiveTab] = useState<IntegrationStatus | null>(null);

  const getStatusIcon = (status: IntegrationStatus) => {
    switch (status) {
      case "healthy": return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
      case "partial": return <AlertCircle className="w-3 h-3 text-amber-500" />;
      case "missing": return <XCircle className="w-3 h-3 text-rose-500" />;
    }
  };

  const statusTints = {
    healthy: "hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20",
    partial: "hover:bg-amber-50 dark:hover:bg-amber-500/10 border-amber-100 dark:border-amber-500/20",
    missing: "hover:bg-rose-50 dark:hover:bg-rose-500/10 border-rose-100 dark:border-rose-500/20",
  };

  const filteredIntegrations = Object.entries(readiness.integrations)
    .filter(([_, data]) => !activeTab || data.status === activeTab);

  return (
    <div className="p-1">
      <div className="flex items-center gap-1 mb-3">
        <LinkIcon className="w-3.5 h-3.5 text-zinc-400" />
        <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          {t("integration_readiness", "Readiness")}
        </p>
        <DashboardTooltip label={t("integration_readiness_help", "Healthy means connected and ready for automation.")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["healthy", "partial", "missing"] as IntegrationStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => setActiveTab(activeTab === status ? null : status)}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 round-full md:rounded-lg text-[11px] font-bold border transition-all",
              "bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-800",
              statusTints[status],
              activeTab === status && "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-zinc-900"
            )}
          >
            {getStatusIcon(status)}
            <span className="capitalize">{t(status, status)}</span>
            <span className="opacity-50 ml-0.5">{readiness.summary[status]}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {activeTab && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-2 gap-2">
              {filteredIntegrations.map(([key, data]) => (
                <div key={key} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    data.status === "healthy" ? "bg-emerald-500" : data.status === "partial" ? "bg-amber-500" : "bg-rose-500"
                  )} />
                  <span className="capitalize">{key}</span>
                </div>
              ))}
              {filteredIntegrations.length === 0 && (
                <p className="text-[10px] text-zinc-400 italic font-medium col-span-2">
                  No systems in this state
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ComplianceSection({ 
  warnings, 
  isSetupComplete, 
  t 
}: { 
  warnings: DashboardData["health"]["complianceWarnings"];
  isSetupComplete: boolean;
  t: (k: string, f: string) => string;
}) {
  return (
    <div className="p-1 h-full flex flex-col justify-between">
      <div>
        <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
          {t("compliance_signals", "Compliance")}
        </p>
        
        <div className="space-y-2">
          {warnings.length === 0 ? (
            <div className="flex items-center gap-2 group">
              <div className="p-1 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 leading-tight">
                {t("no_active_warnings", "Strict Compliance")}
              </p>
            </div>
          ) : (
            warnings.slice(0, 2).map((warning) => (
              <div key={warning.label} className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <ShieldAlert className="w-3.5 h-3.5" />
                <p className="text-xs font-bold leading-tight">{warning.label}</p>
              </div>
            ))
          )}
          
          {isSetupComplete && (
            <div className="flex items-center gap-2 text-zinc-400">
              <Sparkles className="w-3.5 h-3.5" />
              <p className="text-[10px] font-medium italic">{t("setup_verified", "Integrity verified")}</p>
            </div>
          )}
        </div>
      </div>

      <Button variant="link" size="sm" className="px-0 h-6 text-[10px] font-black text-indigo-500 uppercase tracking-tighter justify-start group">
        {t("view_details", "View full audit")}
        <ArrowRight className="w-3 h-3 ml-1 transition-transform group-hover:translate-x-1" />
      </Button>
    </div>
  );
}

// --- Main Layout ---

export function DashboardHealthStrip({ health }: { health: DashboardData["health"] }) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: any) => {
    const translation = t(key as any, values);
    if (translation === key || translation === `Dashboard.${key}`) return fallback;
    return translation;
  };

  return (
    <Card className="relative p-2 sm:p-3 overflow-hidden border-zinc-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md shadow-xl transition-all hover:shadow-2xl hover:shadow-indigo-500/5">
      {/* Decorative vertical line for desktop separator feel */}
      <div className="hidden lg:grid grid-cols-1 lg:grid-cols-[1.5fr_1fr_1.3fr_1fr] gap-0 lg:divide-x lg:divide-zinc-200/50 dark:lg:divide-zinc-800/50">
        <div className="pr-6">
          <SetupSection 
            completion={health.setupCompletion} 
            isComplete={health.setupComplete} 
            t={tr} 
          />
        </div>
        
        <div className="px-6 self-center">
          <SubscriptionSection 
            tier={health.planTier} 
            state={health.subscriptionState} 
            t={tr} 
          />
        </div>

        <div className="px-6 self-center">
          <IntegrationSection 
            readiness={health.integrationReadiness} 
            t={tr} 
          />
        </div>

        <div className="pl-6 self-center h-[80%]">
          <ComplianceSection 
            warnings={health.complianceWarnings} 
            isSetupComplete={health.setupComplete} 
            t={tr} 
          />
        </div>
      </div>

      {/* Mobile Stack */}
      <div className="lg:hidden space-y-6 p-2">
        <SetupSection 
          completion={health.setupCompletion} 
          isComplete={health.setupComplete} 
          t={tr} 
        />
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
          <SubscriptionSection 
            tier={health.planTier} 
            state={health.subscriptionState} 
            t={tr} 
          />
          <IntegrationSection 
            readiness={health.integrationReadiness} 
            t={tr} 
          />
          <ComplianceSection 
            warnings={health.complianceWarnings} 
            isSetupComplete={health.setupComplete} 
            t={tr} 
          />
        </div>
      </div>
    </Card>
  );
}
