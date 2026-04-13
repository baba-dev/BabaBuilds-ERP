"use client";

import Link from "next/link";
import { 
  Activity, 
  ArrowRight, 
  Bell, 
  BellRing, 
  CheckCircle2, 
  ChevronRight, 
  Clock3, 
  DatabaseZap, 
  FilePlus2, 
  FileWarning, 
  History, 
  Lightbulb, 
  Receipt, 
  RefreshCw, 
  ShieldAlert, 
  ShieldCheck, 
  ShoppingBag, 
  Sparkles,
  AlertCircle,
  ShieldEllipsis
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DashboardData } from "./types";

interface DashboardRightRailProps {
  data: DashboardData;
  fCurrency: (val: number | string) => string;
}

type WorkspaceMood = 'critical' | 'warning' | 'opportunity' | 'healthy';

export function DashboardRightRail({ data, fCurrency }: DashboardRightRailProps) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: any) => {
    const translation = t(key as any, values);
    if (translation === key || translation === `Dashboard.${key}`) return fallback;
    return translation;
  };

  const mood = deriveWorkspaceMood(data);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-1000">
      <Card className={`relative overflow-hidden border-zinc-200 dark:border-zinc-800 shadow-2xl shadow-zinc-200/20 dark:shadow-black/40 bg-white dark:bg-zinc-900/95 backdrop-blur-xl group transition-all duration-500`}>
        {/* Intelligence Glow */}
        <div className={`absolute top-0 right-0 w-64 h-64 opacity-[0.03] dark:opacity-[0.07] pointer-events-none -mr-32 -mt-32 rounded-full blur-3xl transition-colors duration-1000 ${
          mood === 'critical' ? 'bg-rose-500' : 
          mood === 'warning' ? 'bg-amber-500' : 
          mood === 'opportunity' ? 'bg-indigo-500' : 
          'bg-emerald-500'
        }`} />
        
        <RightRailHeader tr={tr} mood={mood} />
        
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
          <RecentActivitySection data={data} tr={tr} />
          <RecentNotificationsSection data={data} tr={tr} mood={mood} />
          <SuggestedActionsSection data={data} tr={tr} mood={mood} />
          <SystemSignalsSection data={data} tr={tr} mood={mood} />
          <SyncImportHealthSection data={data} tr={tr} />
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
  
  if ((!data.salesAndShop.shopEnabled && data.salesAndShop.publishedServices > 0) || data.salesAndShop.acceptedAwaitingInvoicing > 0) {
    return 'opportunity';
  }
  
  return 'healthy';
}

function RightRailHeader({ tr, mood }: { tr: any, mood: WorkspaceMood }) {
  const getMoodBadge = () => {
    switch (mood) {
      case 'critical': return { label: tr("mood_critical", "Intervention Needed"), color: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20" };
      case 'warning': return { label: tr("mood_warning", "Analysis Required"), color: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20" };
      case 'opportunity': return { label: tr("mood_opportunity", "Growth Insight"), color: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20" };
      default: return { label: tr("mood_healthy", "Optimal Active"), color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
    }
  };

  const badge = getMoodBadge();

  return (
    <div className="px-5 py-5 bg-zinc-50/50 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between relative">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors duration-500 ${
          mood === 'critical' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' :
          mood === 'warning' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
          mood === 'opportunity' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' :
          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        }`}>
          <Sparkles className="w-5 h-5 animate-pulse duration-3000" />
        </div>
        <div>
          <h3 className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-tight">
            {tr("intelligence_rail", "Intelligence Assistant")}
          </h3>
          <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mt-0.5">
            {tr("erp_ai_brain_sub", "Strategic Command Surface")}
          </p>
        </div>
      </div>
      <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-wider transition-all duration-500 ${badge.color}`}>
        {badge.label}
      </Badge>
    </div>
  );
}

function RecentActivitySection({ data, tr }: { data: DashboardData, tr: any }) {
  const hasActivity = data.activity.length > 0;

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest inline-flex items-center gap-1.5 transition-colors group-hover:text-zinc-500">
          <History className="w-3 h-3" />
          {tr("workspace_signals", "Workspace Stream")}
        </h4>
        {hasActivity && (
          <Link href="/logs" className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase hover:underline opacity-80 hover:opacity-100 transition-all">
            Audit Feed
          </Link>
        )}
      </div>

      <div className="space-y-4">
        {!hasActivity ? (
          <EmptyState 
            icon={<Clock3 className="w-6 h-6 text-zinc-300 dark:text-zinc-700" />}
            title={tr("activity_quiet_title", "Operational calm")}
            description={tr("activity_quiet_desc", "Billing events, reconciliation, and workflow executions will manifest here as your workspace becomes active.")}
          />
        ) : (
          data.activity.slice(0, 3).map((item, idx) => (
            <div 
              key={item.id} 
              className="group/item relative pl-4 border-l-2 border-zinc-100 dark:border-zinc-800 hover:border-indigo-500/50 transition-all animate-in fade-in slide-in-from-left-2"
              style={{ animationDelay: `${idx * 150}ms` }}
            >
              <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200 leading-tight group-hover/item:text-zinc-900 dark:group-hover/item:text-zinc-100 transition-colors">
                {item.action}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </span>
                <span className="w-1 h-1 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <span className={`text-[9px] font-bold uppercase tracking-wider ${
                  item.status.toLowerCase().includes("fail") || item.status.toLowerCase().includes("err")
                    ? "text-rose-500"
                    : "text-emerald-500"
                }`}>
                  {item.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RecentNotificationsSection({ data, tr, mood }: { data: DashboardData, tr: any, mood: WorkspaceMood }) {
  const notifications = [
    ...(data.health.complianceWarnings || []).map(w => ({ type: 'warning', label: w.label, severity: w.severity as 'info' | 'warning' | 'critical' })),
    ...(data.attention.criticalNotifications > 0 ? [{ type: 'critical', label: tr("critical_notifications_interpret", "Immediate attention required for {count} critical anomalies", { count: data.attention.criticalNotifications }), severity: 'critical' as const }] : [])
  ];

  const hasNotifications = notifications.length > 0;

  return (
    <div className="p-5 space-y-4 bg-zinc-50/20 dark:bg-zinc-800/10">
      <h4 className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest inline-flex items-center gap-1.5">
        <Bell className="w-3 h-3" />
        {tr("notifications_center", "Interruptions")}
      </h4>

      <div className="space-y-3">
        {!hasNotifications ? (
          <div className="py-2 px-4 rounded-2xl border border-zinc-100/80 dark:border-zinc-800/50 bg-white/50 dark:bg-zinc-900/30">
             <p className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-tighter">
               {tr("no_active_interruptions", "All Clear")}
             </p>
             <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium mt-0.5">
               {tr("workspace_quiet_note", "No active notifications detected. Your workspace is operating without interruptions.")}
             </p>
          </div>
        ) : (
          notifications.map((n, idx) => (
            <div 
              key={idx}
              className={`flex gap-3.5 p-3.5 rounded-2xl border transition-all duration-300 hover:translate-x-0.5 ${
                n.severity === 'critical' 
                  ? "bg-rose-50/60 border-rose-100 dark:bg-rose-500/5 dark:border-rose-500/10" 
                  : "bg-amber-50/60 border-amber-100 dark:bg-amber-500/5 dark:border-amber-500/10"
              }`}
            >
              <div className={`mt-0.5 rounded-xl h-8 w-8 shrink-0 flex items-center justify-center ${
                n.severity === 'critical' ? "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400" : "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
              }`}>
                {n.severity === 'critical' ? <ShieldAlert className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 leading-snug">{n.label}</p>
                <Badge variant="outline" className={`mt-2 h-4 text-[9px] uppercase font-bold tracking-widest ${
                   n.severity === 'critical' ? "border-rose-200 text-rose-600 dark:border-rose-800 dark:text-rose-500" : "border-amber-200 text-amber-600 dark:border-amber-800 dark:text-amber-500"
                }`}>
                  {n.severity} Signal
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SuggestedActionsSection({ data, tr, mood }: { data: DashboardData, tr: any, mood: WorkspaceMood }) {
  const suggestions = deriveIntelligenceSuggestions(data, tr);

  return (
    <div className="p-5 space-y-5">
      <h4 className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest inline-flex items-center gap-1.5">
        <Sparkles className="w-3 h-3" />
        {tr("intelligence_suggestions", "Contextual Guidance")}
      </h4>

      <div className="space-y-4">
        {suggestions.map((action, idx) => (
          <Link 
            key={idx} 
            href={action.href}
            className="group flex items-start gap-4 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-500 relative overflow-hidden"
          >
            {/* Contextual Glow based on suggestion tone */}
            <div className={`absolute -right-4 -bottom-4 w-12 h-12 opacity-[0.05] rounded-full blur-xl transition-colors ${
              action.tone === 'amber' ? 'bg-amber-500' : 
              action.tone === 'emerald' ? 'bg-emerald-500' : 'bg-indigo-500'
            }`} />

            <div className={`mt-0.5 h-10 w-10 shrink-0 rounded-xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 ${
              action.tone === 'amber' ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
              action.tone === 'emerald' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
              "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
            }`}>
              <action.icon className="w-5 h-5 transition-transform group-hover:rotate-12" />
            </div>
            <div className="flex-1 relative z-10">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {action.label}
                </span>
                <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:translate-x-1.5 transition-transform" />
              </div>
              <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mt-1 lines-clamp-2 leading-relaxed">
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

  // Priorities: Critical Risls > Incomplete Setup > Opportunities > Healthy Maintenance

  if (data.attention.failedImports > 0) {
    suggestions.push({
      label: tr("action_fix_imports", "Resolve Synchronization Gaps"),
      desc: tr("action_fix_imports_desc", "Automated imports encountered anomalies. Manual resolution will fix reporting accuracy."),
      href: "/settings/imports",
      icon: DatabaseZap,
      tone: "amber"
    });
  }

  if (data.health.setupCompletion < 100) {
    suggestions.push({
      label: tr("action_finish_onboarding", "Complete Automation Setup"),
      desc: tr("action_finish_onboarding_desc", "Your workspace is partially configured. A few finishing steps will unlock full AI delegation."),
      href: "/settings",
      icon: FilePlus2,
      tone: "indigo"
    });
  }

  if (data.attention.pendingInvoices > 0) {
    suggestions.push({
      label: tr("action_optimize_receivables", "Tighten Revenue Collections"),
      desc: tr("action_optimize_receivables_desc", "Outstanding invoices are slowing cash velocity. Review receivables to keep capital fluid."),
      href: "/invoice",
      icon: Receipt,
      tone: "amber"
    });
  }

  if (data.financialPulse.reconciliationProgress < 100) {
    suggestions.push({
      label: tr("action_reconcile_books", "Finalize Ledger Integrity"),
      desc: tr("action_reconcile_books_desc", "Match recent banking signals to ensure your financial statements are auditor-ready."),
      href: "/reconciliation",
      icon: ShieldEllipsis,
      tone: "indigo"
    });
  }

  if (!data.salesAndShop.shopEnabled && data.salesAndShop.publishedServices > 0) {
    suggestions.push({
      label: tr("action_launch_store", "Activate Service Catalogue"),
      desc: tr("action_launch_store_desc", "Your services are ready for market. Enabling the public shop will capture passive traffic."),
      href: "/settings/shop",
      icon: ShoppingBag,
      tone: "emerald"
    });
  }

  // Fallback: Growth Context
  if (suggestions.length < 2) {
    suggestions.push({
      label: tr("action_scale_billing", "Expand Client Billing"),
      desc: tr("action_scale_billing_desc", "Your workspace is healthy. Focus on generating new proposals or billable activity."),
      href: "/invoice",
      icon: Sparkles,
      tone: "indigo"
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
    if (mood === 'critical') return tr("sys_critical", "System stability compromised");
    if (mood === 'warning') return tr("sys_warning", "Operational readiness at risk");
    if (mood === 'opportunity') return tr("sys_growth", "Automation readiness is high");
    return tr("sys_healthy", "Core systems are stable");
  };

  return (
    <div className="p-5 space-y-4">
      <h4 className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest inline-flex items-center gap-1.5">
        <Activity className="w-3 h-3" />
        {tr("signals_interpretation", "Derived Signals")}
      </h4>

      <div className="space-y-4">
        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
          {mood === 'healthy' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <AlertCircle className={`w-3.5 h-3.5 ${mood === 'critical' ? 'text-rose-500' : 'text-amber-500'}`} />}
          {getSystemInterpretation()}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <SignalPill label="Trust" value={trust.integrityStatus} tone={healthy ? 'emerald' : 'amber'} />
          <SignalPill label="Config" value={`${integrationCount}/${totalIntegrations} Linkage`} tone={integrationCount === totalIntegrations ? 'emerald' : 'indigo'} />
          <SignalPill label="Vault" value={tr("vault_secure", "Operational")} tone="emerald" />
          <SignalPill label="Compliance" value={data.attention.complianceIssues > 0 ? tr("issues_found", "Issues") : tr("no_issues", "Nominal")} tone={data.attention.complianceIssues > 0 ? 'amber' : 'emerald'} />
        </div>
      </div>
    </div>
  );
}

function SignalPill({ label, value, tone }: { label: string, value: string, tone: 'emerald' | 'amber' | 'indigo' }) {
  const colors = {
    emerald: "text-emerald-600 dark:text-emerald-500 bg-emerald-500/5",
    amber: "text-amber-600 dark:text-amber-500 bg-amber-500/5",
    indigo: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/5",
  };
  return (
    <div className="p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800/60 bg-white/50 dark:bg-zinc-950/20">
      <p className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-tighter">{label}</p>
      <p className={`text-[11px] font-bold mt-1 uppercase ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function SyncImportHealthSection({ data, tr }: { data: DashboardData, tr: any }) {
  const hasFailures = data.attention.failedImports > 0;
  
  return (
    <div className="p-5 space-y-4 bg-zinc-50/10 dark:bg-zinc-800/5">
      <h4 className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest inline-flex items-center gap-1.5">
        <DatabaseZap className="w-3 h-3" />
        {tr("operational_confidence", "Operational Confidence")}
      </h4>

      <div className={`p-4 rounded-2xl border transition-all duration-500 ${
        hasFailures 
          ? "bg-rose-50/50 border-rose-100/80 shadow-lg shadow-rose-500/5 dark:bg-rose-500/5 dark:border-rose-500/20" 
          : "bg-emerald-50 text-emerald-600/50 border-emerald-100/80 dark:bg-emerald-500/5 dark:border-emerald-500/10"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center transition-all ${
              hasFailures ? "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 animate-pulse" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
            }`}>
              {hasFailures ? <FileWarning className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100">
                {hasFailures ? tr("failed_sync_detect", "Sync Anomalies Detected") : tr("sync_healthy_interpret", "Sync Pipeline Stable")}
              </p>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium mt-0.5">
                {hasFailures 
                  ? tr("sync_fix_note", "Manual intervention required for {count} records", { count: data.attention.failedImports })
                  : tr("reassurance_sync", "Infrastructure and data linkage look healthy.")}
              </p>
            </div>
          </div>
          <button className="h-8 w-8 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-indigo-600 hover:border-indigo-500/50 transition-all shadow-sm">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex flex-col items-center text-center p-6 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-zinc-900/10">
      <div className="h-12 w-12 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center mb-4 shadow-sm">
        {icon}
      </div>
      <p className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest">{title}</p>
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2 max-w-[200px] leading-relaxed font-medium">
        {description}
      </p>
    </div>
  );
}
