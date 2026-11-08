"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Landmark } from "lucide-react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fyLabel, fyStartYear } from "@/lib/ca/fy";
import { CalendarTab } from "./CalendarTab";
import { EvidenceTab } from "./EvidenceTab";
import { ItemDrawer } from "./ItemDrawer";
import { OverviewTab } from "./OverviewTab";
import { ReadinessTab } from "./ReadinessTab";
import { RequestsTab } from "./RequestsTab";
import { SetupTab } from "./SetupTab";
import { TABS, useJson, useUrlState, type CaItemView, type Overview, type Tab } from "./ca-utils";

export function CaWorkspace() {
  const t = useTranslations("CaCompliance");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const patch = useUrlState();
  const [editing, setEditing] = useState<CaItemView | null>(null);
  const [askAbout, setAskAbout] = useState<CaItemView | null>(null);

  const current = fyLabel(fyStartYear(new Date()));
  const fy = params.get("fy") ?? current;
  const tabParam = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";
  const overview = useJson<Overview>(`/api/ca/overview?fy=${encodeURIComponent(fy)}`);
  const data = overview.data;

  const setUrl = useCallback((p: Record<string, string | null>) => patch(router, pathname, params, p), [patch, router, pathname, params]);
  const goto = useCallback((next: string) => setUrl({ tab: next === "overview" ? null : next }), [setUrl]);
  const refresh = overview.reload;
  const openAsk = useCallback((item: CaItemView | null) => { setAskAbout(item); setUrl({ tab: "requests" }); }, [setUrl]);

  const years = useMemo(() => data?.years ?? [{ start: fyStartYear(new Date()), label: current }], [data, current]);
  const blockers = data?.readiness.blockers ?? 0;
  const openRequests = data?.requests.open ?? 0;

  const nav = (
    <nav aria-label={t("nav")} className="-mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card p-1.5 shadow-sm [scrollbar-width:none]">
      {TABS.map((k) => (
        <button key={k} type="button" onClick={() => goto(k)} aria-current={tab === k ? "page" : undefined}
          className={cn("relative shrink-0 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === k ? "text-indigo-700 dark:text-indigo-200" : "text-muted-foreground hover:text-foreground")}>
          {tab === k ? <motion.span layoutId="ca-tab" className="absolute inset-0 rounded-xl bg-indigo-50 ring-1 ring-indigo-200/70 dark:bg-indigo-500/15 dark:ring-indigo-400/20" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
          <span className="relative inline-flex items-center gap-1.5">
            {t(`tabs.${k}`)}
            {k === "readiness" && blockers > 0 ? <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold leading-4 text-white">{blockers}</span> : null}
            {k === "requests" && openRequests > 0 ? <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-4 text-white">{openRequests}</span> : null}
          </span>
        </button>
      ))}
    </nav>
  );

  const body = () => {
    if (overview.error && !data) return <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{overview.error}</p>;
    if (!data) return <div className="space-y-4"><Skeleton className="h-56 rounded-3xl" /><Skeleton className="h-28 rounded-2xl" /></div>;
    switch (tab) {
      case "calendar": return <CalendarTab data={data} onOpen={setEditing} goto={goto} />;
      case "readiness": return <ReadinessTab data={data} />;
      case "requests": return <RequestsTab data={data} fy={fy} askAbout={askAbout} onAskHandled={() => setAskAbout(null)} onChanged={refresh} />;
      case "evidence": return <EvidenceTab data={data} fy={fy} />;
      case "setup": return <SetupTab data={data} onSaved={refresh} />;
      default: return <OverviewTab data={data} onOpen={setEditing} goto={goto} onChanged={refresh} />;
    }
  };

  return (
    <DashboardPageShell
      title={t("title")}
      description={t("description")}
      icon={<Landmark className="size-5" aria-hidden />}
      animated={false}
      secondaryActions={
        <Select value={fy} onValueChange={(v) => setUrl({ fy: v === current ? null : v })}>
          <SelectTrigger className="h-9 w-[140px]" aria-label={t("fy")}><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y.label} value={y.label}>FY {y.label}</SelectItem>)}</SelectContent>
        </Select>
      }
    >
      <div className="space-y-5">
        {nav}
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>{body()}</motion.div>
      </div>
      {data ? <ItemDrawer item={editing} data={data} fy={fy} onClose={() => setEditing(null)} onChanged={refresh} onAsk={(i) => { setEditing(null); openAsk(i); }} /> : null}
    </DashboardPageShell>
  );
}
