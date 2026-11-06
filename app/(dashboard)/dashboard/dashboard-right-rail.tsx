"use client";

import Link from "next/link";
import { 
  Activity, 
  ArrowRight, 
  Bell, 
  CheckCircle2, 
  ChevronRight, 
  Clock3, 
  DatabaseZap, 
  FilePlus2, 
  FileWarning, 
  History, 
  Receipt, 
  RefreshCw, 
  ShieldAlert, 
  ShieldCheck, 
  ShoppingBag, 
  Sparkles,
  AlertCircle,
  ShieldEllipsis,
  KeyRound,
  Brain,
  Bot
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardData } from "./types";
import { INTELLIGENCE_SUGGESTION_ROUTES } from "./intelligence-suggestion-routes";
import { dashboardTypography as ty } from "./dashboard-typography";
import { DashboardTooltip } from "./dashboard-tooltip";

interface DashboardRightRailProps {
  data: DashboardData;
  fCurrency: (val: number | string) => string;
  onRefreshSyncImportHealth?: () => Promise<void>;
  syncImportHealthLoading?: boolean;
  syncImportHealthError?: string | null;
}

type WorkspaceMood = 'critical' | 'warning' | 'opportunity' | 'healthy';
type AIState = 'enabled' | 'locked_no_key' | 'fallback';

export function DashboardRightRail({
  data,
  onRefreshSyncImportHealth,
  syncImportHealthLoading = false,
  syncImportHealthError = null,
}: DashboardRightRailProps) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: any) => {
    if (typeof (t as any).has === "function" && !(t as any).has(key)) return fallback;
    try {
      return t(key as any, values);
    } catch {
      return fallback;
    }
  };

  const mood = useMemo(() => deriveWorkspaceMood(data), [data]);
  const aiState = useMemo(() => deriveAIState(data), [data]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-1000">
      <Card className="relative overflow-hidden border-zinc-200 dark:border-zinc-800 shadow-2xl shadow-zinc-200/20 dark:shadow-black/60 bg-white dark:bg-zinc-900/95 backdrop-blur-xl group transition-all duration-700">
        {/* Intelligence Glow - Reacts to AI and Mood */}
        <div className={`absolute top-0 right-0 w-80 h-80 opacity-[0.05] dark:opacity-[0.12] pointer-events-none -mr-40 -mt-40 rounded-full blur-[80px] transition-colors duration-1000 ${
          aiState === 'locked_no_key' ? 'bg-amber-500' :
          mood === 'critical' ? 'bg-rose-500' : 
          mood === 'warning' ? 'bg-amber-500' : 
          mood === 'opportunity' ? 'bg-orange-500' : 
          'bg-emerald-500'
        }`} />
        
        <RightRailHeader tr={tr} mood={mood} aiState={aiState} />
        
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
          <IntelligenceAssistantSection data={data} tr={tr} mood={mood} aiState={aiState} />
          <RecentActivitySection data={data} tr={tr} />
          <RecentNotificationsSection data={data} tr={tr} mood={mood} />
          <SuggestedActionsSection data={data} tr={tr} mood={mood} />
          <SystemSignalsSection data={data} tr={tr} mood={mood} />
          <SyncImportHealthSection
            data={data}
            tr={tr}
            onRefreshSyncImportHealth={onRefreshSyncImportHealth}
            isRefreshing={syncImportHealthLoading}
            error={syncImportHealthError}
          />
        </div>
      </Card>
    </div>
  );
}


function deriveWorkspaceMood(data: DashboardData): WorkspaceMood {
  const { attention, trust, health } = data;
  
  if (attention.failedImports > 0 || trust.criticalViolations > 0 || health.complianceWarnings.some(w => w.severity === 'critical')) {
    return 'critical';
  }
  
  if (health.setupCompletion < 100 || data.financialPulse.reconciliationProgress < 100 || trust.integrityStatus === 'FAILED' || attention.totalUrgent > 0) {
    return 'warning';
  }
  
  if ((!data.salesAndShop.shopEnabled && data.salesAndShop.publishedProducts > 0) || data.salesAndShop.acceptedAwaitingInvoicing > 0) {
    return 'opportunity';
  }
  
  return 'healthy';
}

function deriveAIState(data: DashboardData): AIState {
  const isGroqConfigured = data.health.integrationReadiness.integrations.groq.configured;
  if (!isGroqConfigured) return 'locked_no_key';
  if (data.health.integrationReadiness.integrations.groq.status !== 'healthy') return 'fallback';
  return 'enabled';
}

function RightRailHeader({ tr, mood, aiState }: { tr: any, mood: WorkspaceMood, aiState: AIState }) {
  const getHeaderInfo = () => {
    if (aiState === 'locked_no_key') {
      return {
        title: tr("intelligence_setup_incomplete_title", "Intelligence Setup Incomplete"),
        sub: tr("intelligence_setup_incomplete_sub", "Groq Key Required"),
        icon: KeyRound,
        badge: { label: tr("status_setup_incomplete", "Setup Incomplete"), color: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20" }
      };
    }

    const labels = {
      critical: { label: tr("mood_critical", "Intervention Needed"), color: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20" },
      warning: { label: tr("mood_warning", "Analysis Required"), color: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20" },
      opportunity: { label: tr("mood_opportunity", "Growth Insight"), color: "text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20" },
      healthy: { label: tr("mood_healthy", "Optimal Active"), color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20" }
    };

    return {
      title: tr("intelligence_rail", "Workspace Intelligence"),
      sub: tr("erp_ai_brain_sub", "Strategic Command Surface"),
      icon: Sparkles,
      badge: labels[mood]
    };
  };

  const info = getHeaderInfo();
  const Icon = info.icon;

  return (
    <div className="px-6 py-6 bg-zinc-50/80 dark:bg-zinc-800/60 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between relative group/header">
      <div className="flex items-center gap-4">
        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-700 shadow-sm ${
          aiState === 'locked_no_key' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 rotate-12 group-hover/header:rotate-0' :
          mood === 'critical' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' :
          mood === 'warning' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
          mood === 'opportunity' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' :
          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        }`}>
          <Icon className={`w-6 h-6 ${aiState === 'enabled' ? 'animate-pulse' : ''}`} />
        </div>
        <div>
          <h3 className={ty.cardTitle}>
            {info.title}
          </h3>
          <p className={`${ty.labelUpper} mt-0.5`}>
            {info.sub}
          </p>
        </div>
      </div>
      <Badge variant="outline" className={`${ty.labelUpper} transition-all duration-500 h-6 px-2.5 ${info.badge.color}`}>
        {info.badge.label}
      </Badge>
    </div>
  );
}

function IntelligenceAssistantSection({ tr, aiState }: { data: DashboardData, tr: any, mood: WorkspaceMood, aiState: AIState }) {
  if (aiState === 'locked_no_key') {
    return (
      <div className="p-6 bg-gradient-to-br from-amber-50/40 to-transparent dark:from-amber-500/5 dark:to-transparent">
        <div className="flex gap-4 items-start">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-sm">
            <Brain className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className={ty.cardTitle}>
              {tr("ai_setup_incomplete_headline", "AI Setup Incomplete")}
            </p>
            <p className={`${ty.helper} mt-1.5 line-clamp-3 text-muted-foreground`}>
              {tr("ai_setup_incomplete_body", "Add your Groq API key in Business Settings to complete setup and unlock strategic suggestions, automated finance guidance, and deeper workspace analysis.")}
            </p>
            <Link href="/settings">
              <Button size="sm" variant="outline" className="mt-4 h-9 bg-white dark:bg-zinc-900 border-amber-200 dark:border-amber-900/40 hover:bg-amber-50 dark:hover:bg-amber-900/10 text-amber-700 dark:text-amber-400 font-bold gap-2 text-xs uppercase tracking-wide px-4 transition-all">
                <KeyRound className="w-3.5 h-3.5" />
                {tr("ai_locked_cta", "Configure Groq Key")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (aiState === 'fallback') {
    return (
      <div className="p-6 bg-zinc-50/50 dark:bg-zinc-800/20">
        <div className="flex gap-4 items-start">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-muted-foreground shadow-sm">
            <Bot className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className={ty.cardTitle}>
              {tr("ai_fallback_headline", "Standard Intelligence Active")}
            </p>
            <p className={`${ty.helper} mt-1.5 line-clamp-2 text-muted-foreground`}>
              {tr("ai_fallback_body", "Using baseline rules instead of neural models due to connection limits.")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-orange-50/20 dark:bg-orange-500/5">
      <div className="flex items-center gap-4">
        <div className="flex -space-x-2">
          {[1,2,3].map(i => (
            <div key={i} className="h-7 w-7 rounded-full border-2 border-white dark:border-zinc-900 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-sm">
               <Bot className="w-4 h-4 text-muted-foreground" />
            </div>
          ))}
        </div>
        <p className={ty.labelUpper}>
          {tr("active_observers", "3 Intelligent Observers active")}
        </p>
      </div>
    </div>
  );
}

function RecentActivitySection({ data, tr }: { data: DashboardData, tr: any }) {
  const hasActivity = data.activity.length > 0;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h4 className={`${ty.labelUpper} inline-flex items-center gap-2`}>
          <History className="w-4 h-4" />
          {tr("workspace_signals", "Workspace Stream")}
        </h4>
        {hasActivity && (
          <Link href="/admin" className={`${ty.labelUpper} text-orange-600 dark:text-orange-400 hover:underline opacity-80 hover:opacity-100 transition-all inline-flex items-center gap-1 group`}>
            {tr("audit_feed", "Audit Feed")}
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}
      </div>

      <div className="space-y-4">
        {!hasActivity ? (
          <div className="py-8 text-center flex flex-col items-center">
            <Clock3 className="w-9 h-9 text-zinc-200 dark:text-zinc-800 mb-3" />
            <p className={ty.cardTitle}>
              {tr("activity_quiet_title", "Operational Calm")}
            </p>
              <p className={`${ty.helper} mt-1.5 max-w-[220px] text-muted-foreground`}>
              {tr("activity_quiet_desc", "Billing, reconciliation, and workflow events will appear here as your workspace becomes active.")}
            </p>
          </div>
        ) : (
          data.activity.slice(0, 3).map((item, idx) => (
            <div 
              key={item.id} 
              className="group/item relative pl-5 border-l-2 border-zinc-100 dark:border-zinc-800/80 hover:border-orange-500/50 transition-all animate-in fade-in slide-in-from-left-2"
              style={{ animationDelay: `${idx * 150}ms` }}
            >
              <p className={`${ty.cardTitle} leading-tight group-hover/item:text-zinc-900 dark:group-hover/item:text-zinc-100 transition-colors`}>
                {item.action}
              </p>
              <div className="flex items-center gap-2.5 mt-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </span>
                <span className="w-1 h-1 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <Badge variant="outline" className={`${ty.kpiBadge} py-0 rounded-sm px-1.5 ${
                  item.status.toLowerCase().includes("fail") || item.status.toLowerCase().includes("err")
                    ? "text-rose-500 border-rose-500/20 bg-rose-500/5"
                    : "text-emerald-500 border-emerald-500/20 bg-emerald-500/5"
                }`}>
                  {item.status}
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RecentNotificationsSection({ data, tr }: { data: DashboardData, tr: any, mood: WorkspaceMood }) {
  const notifications = [
    ...(data.health.complianceWarnings || []).map(w => ({ type: 'warning', label: w.label, severity: w.severity as 'info' | 'warning' | 'critical' })),
    ...(data.attention.criticalNotifications > 0 ? [{ type: 'critical', label: tr("critical_notifications_interpret", "Immediate attention required for {count} critical anomalies", { count: data.attention.criticalNotifications }), severity: 'critical' as const }] : [])
  ];

  const hasNotifications = notifications.length > 0;

  return (
    <div className="p-6 space-y-5 bg-zinc-50/30 dark:bg-zinc-800/20">
      <h4 className={`${ty.labelUpper} inline-flex items-center gap-2`}>
        <Bell className="w-4 h-4" />
        {tr("notifications_center", "Interruptions")}
      </h4>

      <div className="space-y-4">
        {!hasNotifications ? (
          <div className="p-4 rounded-2xl border border-zinc-100/80 dark:border-zinc-800/50 bg-white/50 dark:bg-zinc-900/30">
             <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
               <p className={ty.cardTitle}>
                 {tr("no_active_interruptions", "Workspace Silent")}
               </p>
             </div>
             <p className={`${ty.helper} mt-1.5 text-muted-foreground`}>
               {tr("workspace_quiet_note", "No active interruptions. Your workspace is operating quietly right now.")}
             </p>
          </div>
        ) : (
          notifications.map((n, idx) => (
            <div 
              key={idx}
              className={`flex gap-4 p-4 rounded-2xl border transition-all duration-300 hover:translate-x-1 ${
                n.severity === 'critical' 
                  ? "bg-rose-50/60 border-rose-100 dark:bg-rose-500/5 dark:border-rose-500/10" 
                  : "bg-amber-50/60 border-amber-100 dark:bg-amber-500/5 dark:border-amber-500/10 shadow-sm"
              }`}
            >
              <div className={`mt-0.5 rounded-xl h-10 w-10 shrink-0 flex items-center justify-center ${
                n.severity === 'critical' ? "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400" : "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
              }`}>
                {n.severity === 'critical' ? <ShieldAlert className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              </div>
              <div>
                <p className={`${ty.cardTitle} leading-snug`}>{n.label}</p>
                <div className="flex items-center gap-2.5 mt-2.5">
                  <Badge variant="outline" className={`${ty.kpiBadge} px-2 ${
                     n.severity === 'critical' ? "border-rose-200 text-rose-600 dark:border-rose-800 dark:text-rose-500" : "border-amber-200 text-amber-600 dark:border-amber-800 dark:text-amber-500"
                  }`}>
                    {n.severity.toUpperCase()}
                  </Badge>
                  <span className={`${ty.labelUpper} cursor-help hover:text-foreground transition-colors`}>{tr("action_required", "Action Required")}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SuggestedActionsSection({ data, tr }: { data: DashboardData, tr: any, mood: WorkspaceMood }) {
  const suggestions = useMemo(() => deriveIntelligenceSuggestions(data, tr), [data, tr]);

  return (
    <div className="p-6 space-y-5">
      <h4 className={`${ty.labelUpper} inline-flex items-center gap-2`}>
        <Sparkles className="w-4 h-4" />
        {tr("intelligence_suggestions", "Contextual Guidance")}
        <DashboardTooltip label="Guided recommendations are prioritized from setup completion, reconciliation status, receivables pressure, and module readiness." />
      </h4>

      <div className="space-y-4">
        {suggestions.map((action, idx) => (
          <Link 
            key={idx} 
            href={action.href}
            className="group flex items-start gap-4 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 hover:border-orange-500/40 hover:shadow-2xl hover:shadow-orange-500/5 transition-all duration-500 relative overflow-hidden"
          >
            {/* Contextual Glow */}
            <div className={`absolute -right-6 -bottom-6 w-20 h-20 opacity-[0.08] rounded-full blur-2xl transition-colors ${
              action.tone === 'amber' ? 'bg-amber-500' : 
              action.tone === 'emerald' ? 'bg-emerald-500' : 'bg-orange-500'
            }`} />

            <div className={`mt-0.5 h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center transition-all duration-700 shadow-sm group-hover:scale-110 group-hover:rotate-3 ${
              action.tone === 'amber' ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
              action.tone === 'emerald' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
              "bg-orange-500/10 text-orange-600 dark:text-orange-400"
            }`}>
              <action.icon className="w-6 h-6 transition-transform duration-500 group-hover:scale-110" />
            </div>
            <div className="flex-1 relative z-10">
              <div className="flex items-center justify-between">
                <span className={`${ty.cardTitle} group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors`}>
                  {action.label}
                </span>
                <ChevronRight className="w-4.5 h-4.5 text-muted-foreground group-hover:translate-x-1.5 transition-transform" />
              </div>
              <p className={`${ty.helper} mt-1.5 line-clamp-2 leading-normal text-muted-foreground`}>
                {action.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function deriveIntelligenceSuggestions(data: DashboardData, tr: any) {
  const suggestions = [];

  // Strategic Priority Logic
  if (data.attention.failedImports > 0) {
    suggestions.push({
      label: tr("action_fix_imports", "Resolve Failed Data Syncs"),
      desc: tr("action_fix_imports_desc", "Data import failures detected. Resolution is mandatory for statement accuracy."),
      href: INTELLIGENCE_SUGGESTION_ROUTES.fixImports,
      icon: DatabaseZap,
      tone: "amber"
    });
  }

  if (data.health.setupCompletion < 100) {
    suggestions.push({
      label: tr("action_finish_onboarding", "Finalize Workspace Configuration"),
      desc: tr("action_finish_onboarding_desc", "A few remaining setup steps will unlock full automation and cleaner workstreams."),
      href: INTELLIGENCE_SUGGESTION_ROUTES.finishOnboarding,
      icon: FilePlus2,
      tone: "accent"
    });
  }

  if (data.attention.pendingInvoices > 0) {
    suggestions.push({
      label: tr("action_optimize_receivables", "Review Outstanding Receivables"),
      desc: tr("action_optimize_receivables_desc", "Pending invoices identified. Strategic follow-up will optimize available cash."),
      href: INTELLIGENCE_SUGGESTION_ROUTES.reviewReceivables,
      icon: Receipt,
      tone: "amber"
    });
  }

  if (data.financialPulse.reconciliationProgress < 100) {
    suggestions.push({
      label: tr("action_reconcile_books", "Execute Final Reconciliation"),
      desc: tr("action_reconcile_books_desc", "Unmatched bank entries detected. Reconcile to ensure ledger trust."),
      href: INTELLIGENCE_SUGGESTION_ROUTES.reconcileBooks,
      icon: ShieldEllipsis,
      tone: "accent"
    });
  }

  if (!data.salesAndShop.shopEnabled && data.salesAndShop.publishedProducts > 0) {
    suggestions.push({
      label: tr("action_launch_store", "Enable Storefront Publicly"),
      desc: tr("action_launch_store_desc", "Your published services are ready for public orders. Growth signal is active."),
      href: INTELLIGENCE_SUGGESTION_ROUTES.launchStorefront,
      icon: ShoppingBag,
      tone: "emerald"
    });
  }

  // Fallback: Growth Context
  if (suggestions.length < 2) {
    suggestions.push({
      label: tr("action_scale_billing", "Focus on Revenue Generation"),
      desc: tr("action_scale_billing_desc", "Workspace state is stable. Now is the peak time to generate new growth signals."),
      href: INTELLIGENCE_SUGGESTION_ROUTES.scaleBilling,
      icon: Sparkles,
      tone: "accent"
    });
  }

  return suggestions.slice(0, 3);
}

function SystemSignalsSection({ data, tr, mood }: { data: DashboardData, tr: any, mood: WorkspaceMood }) {
  const { trust, health } = data;
  const healthy = trust.integrityStatus === "PASSED" || trust.integrityStatus === "COMPLETED";
  const integrationCount = Object.values(health.integrationReadiness.integrations).filter(i => i.configured).length;
  const totalIntegrations = Object.keys(health.integrationReadiness.integrations).length;

  const getSystemInterpretation = () => {
    if (mood === 'critical') return tr("sys_critical", "Core systems compromised");
    if (mood === 'warning') return tr("sys_warning", "Operational readiness at risk");
    if (mood === 'opportunity') return tr("sys_growth", "Automation readiness high");
    return tr("sys_healthy", "Core systems are stable");
  };

  return (
    <div className="p-6 space-y-5">
      <h4 className={`${ty.labelUpper} inline-flex items-center gap-2`}>
        <Activity className="w-4 h-4" />
        {tr("signals_interpretation", "Derived Signals")}
      </h4>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
           <p className={`${ty.cardTitle} flex items-center gap-2.5 ${
             mood === 'healthy' ? 'text-emerald-600 dark:text-emerald-400' :
             mood === 'critical' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
           }`}>
            {mood === 'healthy' ? <CheckCircle2 className="w-4.5 h-4.5" /> : <ShieldAlert className="w-4.5 h-4.5" />}
            {getSystemInterpretation()}
          </p>
          <Badge variant="outline" className={`${ty.labelUpper} opacity-60`}>{tr("real_time", "Real-time")}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SignalPill label={tr("trust_index", "Trust Index")} value={trust.integrityStatus} tone={healthy ? 'emerald' : 'amber'} />
          <SignalPill label={tr("linkage", "Linkage")} value={`${integrationCount}/${totalIntegrations} Sync`} tone={integrationCount === totalIntegrations ? 'emerald' : 'accent'} />
          <SignalPill label={tr("operational", "Operational")} value={tr("vault_secure", "Active")} tone="emerald" />
          <SignalPill label={tr("compliance", "Compliance")} value={data.attention.complianceIssues > 0 ? tr("risk_detected", "Risk") : tr("nominal", "Nominal")} tone={data.attention.complianceIssues > 0 ? 'amber' : 'emerald'} />
        </div>
      </div>
    </div>
  );
}

function SignalPill({ label, value, tone }: { label: string, value: string, tone: 'emerald' | 'amber' | 'accent' }) {
  const colors = {
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    accent: "text-orange-600 dark:text-orange-300 bg-orange-500/10 border-orange-500/20",
  };
  return (
    <div className={`p-4 rounded-2xl border bg-white/50 dark:bg-zinc-950/20 transition-all hover:bg-white dark:hover:bg-zinc-900 shadow-sm ${colors[tone]}`}>
      <p className={ty.labelUpper}>{label}</p>
      <p className={`mt-2 ${ty.cardTitle} truncate`}>{value}</p>
    </div>
  );
}

function SyncImportHealthSection({
  data,
  tr,
  onRefreshSyncImportHealth,
  isRefreshing,
  error,
}: {
  data: DashboardData;
  tr: any;
  onRefreshSyncImportHealth?: () => Promise<void>;
  isRefreshing: boolean;
  error: string | null;
}) {
  const hasFailures = data.attention.failedImports > 0;
  
  const handleRefresh = async () => {
    if (!onRefreshSyncImportHealth || isRefreshing) return;
    await onRefreshSyncImportHealth();
  };
  
  return (
    <div className="p-6 space-y-5 bg-zinc-50/20 dark:bg-zinc-800/20">
      <h4 className={`${ty.labelUpper} inline-flex items-center gap-2`}>
        <DatabaseZap className="w-4 h-4" />
        {tr("operational_confidence", "Operational Pipeline")}
      </h4>

      <div className={`p-5 rounded-2xl border transition-all duration-700 shadow-sm ${
        hasFailures 
          ? "bg-rose-50/50 border-rose-100 dark:bg-rose-500/5 dark:border-rose-500/20" 
          : "bg-emerald-50/50 border-emerald-100 dark:bg-emerald-500/5 dark:border-emerald-500/20"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className={`h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center transition-all shadow-sm ${
              hasFailures ? "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 animate-pulse" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
            }`}>
              {hasFailures ? <FileWarning className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
            </div>
            <div>
              <p className={ty.cardTitle}>
                {hasFailures ? tr("failed_sync_detect", "Sync Anomalies Detected") : tr("sync_healthy_interpret", "Sync Pipeline Stable")}
              </p>
              <p className={`${ty.helper} mt-1.5 leading-normal`}>
                {hasFailures 
                  ? tr("sync_fix_note", "Manual intervention required for {count} records", { count: data.attention.failedImports })
                  : tr("reassurance_sync", "Infrastructure and data linkage are nominal.")}
              </p>
              {error ? (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-2">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
          {onRefreshSyncImportHealth ? (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label={tr("refresh_sync_pipeline", "Refresh sync pipeline status")}
              className="h-10 w-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-muted-foreground hover:text-orange-600 hover:border-orange-500/50 transition-all shadow-sm active:scale-90 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:text-muted-foreground disabled:hover:border-zinc-100 dark:disabled:hover:border-zinc-800"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          ) : (
            <div className="h-10 px-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center gap-2 text-muted-foreground cursor-default select-none">
              <RefreshCw className="w-4 h-4" />
              <span className="text-xs font-medium">{tr("sync_status_live", "Status updates live")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
