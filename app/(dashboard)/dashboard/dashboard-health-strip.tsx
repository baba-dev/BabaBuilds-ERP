import { 
  Sparkles, 
  ArrowRight, 
  Zap, 
  Clock
} from "lucide-react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./types";
import { DashboardAIPromptBar } from "./dashboard-ai-prompt-bar";
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
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
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
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-900/60 dark:text-indigo-400/80">
              {t("workspace_setup", "Workspace setup")}
            </p>
          </div>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{completion}%</p>
        </div>

        <div className="space-y-2">
          <div className="h-1.5 w-full bg-indigo-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${completion}%` }}
              transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
              className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(79,70,229,0.4)]"
            />
          </div>
          <p className="text-[11px] text-indigo-800/70 dark:text-zinc-400 font-medium leading-tight">
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
            className="w-full h-8 justify-between group hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold border border-transparent hover:border-indigo-200 dark:hover:border-indigo-500/30 text-[11px]"
          >
            <Link href="/onboarding">
              {t("continue_setup", "Continue setup")}
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
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
          <p className="text-xl font-black tracking-tighter text-zinc-900 dark:text-zinc-100">
            {tier.toUpperCase()}
          </p>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-zinc-200 dark:border-zinc-800 text-zinc-500 font-bold">
            {state}
          </Badge>
        </div>
        <p className="text-[11px] text-zinc-500 flex items-center gap-1 font-medium">
          <Clock className="w-3 h-3 text-indigo-500/50" />
          {t("active_billing", "Billing cycle active")}
        </p>
      </div>
    </div>
  );
}

// (Deleted IntegrationSection and ComplianceSection as they are replaced by DashboardAIPromptBar)

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
      <div className="hidden lg:grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_2fr] gap-0 lg:divide-x lg:divide-zinc-200/50 dark:lg:divide-zinc-800/50">
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

        <div className="pl-6 self-center">
          <DashboardAIPromptBar />
        </div>
      </div>

      {/* Mobile Stack */}
      <div className="lg:hidden space-y-6 p-2">
        <SetupSection 
          completion={health.setupCompletion} 
          isComplete={health.setupComplete} 
          t={tr} 
        />
        
        <div className="pt-2">
          <SubscriptionSection 
            tier={health.planTier} 
            state={health.subscriptionState} 
            t={tr} 
          />
        </div>

        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
          <DashboardAIPromptBar />
        </div>
      </div>
    </Card>
  );
}
