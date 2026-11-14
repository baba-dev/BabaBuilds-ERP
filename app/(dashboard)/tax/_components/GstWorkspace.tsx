"use client";

import { SmallBusinessPanel } from "./SmallBusinessPanel";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Landmark, LineChart } from "lucide-react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { GstIssue } from "@/lib/gst/issues";
import { Gstr1Tab } from "./Gstr1Tab";
import { Gstr3bTab } from "./Gstr3bTab";
import { Gstr9Tab } from "./Gstr9Tab";
import { ItcTab } from "./ItcTab";
import { DocumentsTab } from "./DocumentsTab";
import { ToolsTab } from "./ToolsTab";
import { IssuesTab } from "./IssuesTab";
import { OverviewTab } from "./OverviewTab";
import { ReconTab } from "./ReconTab";
import { SetupTab } from "./SetupTab";
import { ExtendDialog, FileReturnDialog } from "./ReturnDialogs";
import { useJson, useUrlState, type GstOverview, type ObligationView } from "./gst-utils";

const TABS = ["overview", "gstr1", "gstr3b", "gstr9", "itc", "recon", "documents", "tools", "issues", "setup"] as const;
type Tab = (typeof TABS)[number];

function fyOptions(current: number) {
  return [current + 1, current, current - 1, current - 2, current - 3].map((y) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`);
}

export function GstWorkspace({ currentFy }: { currentFy: number }) {
  const t = useTranslations("GstHub");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const patch = useUrlState();

  const tabParam = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";
  const fy = params.get("fy") ?? `${currentFy}-${String((currentFy + 1) % 100).padStart(2, "0")}`;
  const overview = useJson<GstOverview>(`/api/gst/overview?fy=${encodeURIComponent(fy)}`);
  const issues = useJson<{ issues: GstIssue[] }>("/api/gst/issues");
  const [filing, setFiling] = useState<ObligationView | null>(null);
  const [extending, setExtending] = useState<ObligationView | null>(null);

  const setUrl = useCallback((p: Record<string, string | null>) => patch(router, pathname, params, p), [patch, router, pathname, params]);
  const goto = useCallback((next: string) => setUrl({ tab: next === "overview" ? null : next }), [setUrl]);
  const refresh = useCallback(() => { overview.reload(); issues.reload(); }, [overview, issues]);

  const data = overview.data;
  const access = data?.access ?? { manage: false, file: false, approve: false };
  const obligations = useMemo(() => data?.obligations ?? [], [data]);
  const defaultPeriod = useCallback((type: "GSTR1" | "GSTR3B") => {
    const list = obligations.filter((o) => o.returnType === type);
    const pick = list.filter((o) => o.status !== "OPEN_PERIOD" && o.status !== "FILED").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
      ?? [...list].reverse().find((o) => o.status === "FILED" || o.status === "OPEN_PERIOD") ?? list[0];
    return pick?.periodKey ?? "";
  }, [obligations]);
  const period = params.get("period") ?? "";
  const months = useMemo(() => {
    const keys: string[] = [];
    const startYear = Number(fy.slice(0, 4));
    for (let i = 0; i < 12; i += 1) { const m0 = (3 + i) % 12; keys.push(`${m0 >= 3 ? startYear : startYear + 1}-${String(m0 + 1).padStart(2, "0")}`); }
    return keys;
  }, [fy]);

  const issueCount = issues.data?.issues.filter((i) => i.severity !== "info").length ?? 0;
  const notApplicable = data && data.profile.countryCode !== "IN";
  const unregistered = data?.profile.registrationType === "UNREGISTERED";

  const openObligation = (o: ObligationView) => {
    const target = o.returnType === "GSTR3B" ? "gstr3b" : o.returnType === "GSTR9" ? "gstr9" : "gstr1";
    setUrl({ tab: target, period: o.returnType === "GSTR9" ? null : o.periodKey });
  };

  const nav = (
    <nav aria-label={t("nav")} className="-mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card p-1.5 shadow-sm [scrollbar-width:none]">
      {TABS.map((k) => (
        <button key={k} type="button" onClick={() => goto(k)} aria-current={tab === k ? "page" : undefined}
          className={cn("relative shrink-0 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === k ? "text-indigo-700 dark:text-indigo-200" : "text-muted-foreground hover:text-foreground")}>
          {tab === k ? <motion.span layoutId="gst-tab" className="absolute inset-0 rounded-xl bg-indigo-50 ring-1 ring-indigo-200/70 dark:bg-indigo-500/15 dark:ring-indigo-400/20" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
          <span className="relative inline-flex items-center gap-1.5">
            {t(`tabs.${k}`)}
            {k === "issues" && issueCount > 0 ? <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold leading-4 text-white">{issueCount}</span> : null}
          </span>
        </button>
      ))}
    </nav>
  );

  const body = () => {
    if (overview.error && !data) return <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{overview.error}</p>;
    if (!data) return <div className="space-y-4"><Skeleton className="h-56 rounded-3xl" /><Skeleton className="h-28 rounded-2xl" /></div>;
    if (notApplicable) {
      return <div className="rounded-2xl border border-dashed border-border p-10 text-center"><Landmark className="mx-auto size-8 text-muted-foreground" aria-hidden /><p className="mt-3 text-base font-semibold">{t("notIndia.title")}</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("notIndia.body")}</p><Link href="/tax/income-tax" className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("notIndia.cta")}</Link></div>;
    }
    if (tab === "setup") return <SetupTab onSaved={refresh} canManage={access.manage} />;
    if (unregistered && tab === "overview") return <SmallBusinessPanel goto={goto} />;
    if (unregistered && tab !== "overview") {
      return <div className="rounded-2xl border border-dashed border-border p-10 text-center"><p className="text-base font-semibold">{t("unregistered.title")}</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("unregistered.body")}</p><button type="button" onClick={() => goto("setup")} className="mt-4 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("unregistered.cta")}</button></div>;
    }
    switch (tab) {
      case "gstr1": return <Gstr1Tab obligations={obligations} period={period || defaultPeriod("GSTR1")} onPeriod={(p) => setUrl({ period: p })} onFile={setFiling} access={access} onChanged={refresh} />;
      case "gstr3b": return <Gstr3bTab obligations={obligations} period={period || defaultPeriod("GSTR3B")} onPeriod={(p) => setUrl({ period: p })} onFile={setFiling} access={access} onChanged={refresh} />;
      case "gstr9": return <Gstr9Tab fy={fy} obligation={obligations.find((o) => o.returnType === "GSTR9")} onFile={setFiling} access={access} onChanged={refresh} />;
      case "itc": return <ItcTab fy={fy} canManage={access.manage} />;
      case "recon": return <ReconTab key={fy} months={months} initial={period} canManage={access.manage} />;
      case "documents": return <DocumentsTab fy={fy} canManage={access.manage} obligations={obligations} />;
      case "tools": return <ToolsTab fy={fy} obligations={obligations} canManage={access.manage} />;
      case "issues": return <IssuesTab issues={issues.data?.issues ?? null} loading={issues.loading} goto={goto} />;
      default: return <><SmallBusinessPanel goto={goto} /><div className="h-5" /><OverviewTab data={data} canFile={access.file} canManage={access.manage} issueCount={issueCount} onOpen={openObligation} onFile={setFiling} onExtend={setExtending} goto={goto} /></>;
    }
  };

  return (
    <DashboardPageShell
      title={t("title")}
      description={t("description")}
      icon={<Landmark className="size-5" aria-hidden />}
      secondaryActions={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={fy} onValueChange={(v) => setUrl({ fy: v === `${currentFy}-${String((currentFy + 1) % 100).padStart(2, "0")}` ? null : v, period: null })}>
            <SelectTrigger className="h-9 w-[130px]" aria-label={t("fy")}><SelectValue /></SelectTrigger>
            <SelectContent>{fyOptions(currentFy).map((o) => <SelectItem key={o} value={o}>FY {o}</SelectItem>)}</SelectContent>
          </Select>
          <Link href="/tax/income-tax" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/70 bg-card px-3 text-sm font-medium shadow-sm hover:bg-muted/50"><LineChart className="size-4" aria-hidden />{t("incomeTax")}</Link>
        </div>
      }
    >
      <div className="space-y-5">
        {nav}
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>{body()}</motion.div>
      </div>
      <FileReturnDialog obligation={filing} onClose={() => setFiling(null)} onDone={refresh} />
      <ExtendDialog obligation={extending} onClose={() => setExtending(null)} onDone={refresh} />
    </DashboardPageShell>
  );
}
