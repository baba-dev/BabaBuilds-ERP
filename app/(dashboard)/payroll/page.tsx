"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw, Settings2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import { MyPayslips, type MyPayslip } from "./_components/MyPayslips";
import { OverviewPanel } from "./_components/OverviewPanel";
import { PeoplePanel } from "./_components/PeoplePanel";
import { StatutoryPanel } from "./_components/StatutoryPanel";
import { api, type Overview, type PeopleResponse, type RemittancesResponse } from "./_components/shared";

const TABS = ["overview", "people", "statutory", "mine"] as const;
type Tab = (typeof TABS)[number];

function PayrollWorkspace() {
  const t = useTranslations("PayrollHub");
  const { fCurrency, currency, locale } = useFormat();
  const router = useRouter();
  const sp = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(sp.get("tab") ?? "") ? (sp.get("tab") as Tab) : "overview";

  const [overview, setOverview] = useState<Overview | null>(null);
  const [people, setPeople] = useState<PeopleResponse | null>(null);
  const [rem, setRem] = useState<RemittancesResponse | null>(null);
  const [mine, setMine] = useState<{ linked: boolean; items: MyPayslip[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const money = useMemo(() => (n: number) => fCurrency(n), [fCurrency]);
  const setTab = useCallback((k: Tab) => { const next = new URLSearchParams(sp.toString()); next.set("tab", k); router.replace(`/payroll?${next.toString()}`, { scroll: false }); }, [router, sp]);
  const reload = useCallback(() => { setLoading(true); setTick((n) => n + 1); }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api<Overview>("/api/payroll/overview"), api<PeopleResponse>("/api/payroll/people"), api<RemittancesResponse>("/api/payroll/remittances"), api<{ linked: boolean; items: MyPayslip[] }>("/api/payroll/my-payslips")]).then(([o, p, r, m]) => {
      if (cancelled) return;
      if (o.status === "rejected") setError(o.reason instanceof Error ? o.reason.message : "error"); else { setOverview(o.value); setError(null); }
      if (p.status === "fulfilled") setPeople(p.value);
      if (r.status === "fulfilled") setRem(r.value);
      if (m.status === "fulfilled") setMine(m.value);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tick]);

  const visibleTabs = TABS.filter((k) => k !== "mine" || mine?.linked);

  return (
    <DashboardPageShell
      title={t("title")}
      description={t("subtitle")}
      icon={<Wallet className="h-6 w-6 text-primary" />}
      pageActions={
        <div className="flex items-center gap-2">
          {overview?.perms.settings ? <Button asChild variant="outline" size="sm" className="gap-1.5"><Link href="/payroll/settings"><Settings2 className="h-4 w-4" />{t("settings")}</Link></Button> : null}
          <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-1.5">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t("refresh")}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label={t("title")}>
          {visibleTabs.map((k) => <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{t(`tab.${k}`)}{k === "statutory" && rem && rem.summary.overdueCount > 0 ? <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{rem.summary.overdueCount}</span> : null}</button>)}
        </nav>

        {error && !overview ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8 text-center"><p className="font-medium">{t("loadFailed")}</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button className="mt-4" variant="outline" onClick={reload}>{t("retry")}</Button></div>
        ) : !overview || !people || !rem ? (
          <div className="space-y-4"><Skeleton className="h-52 rounded-3xl" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div><Skeleton className="h-72 rounded-3xl" /></div>
        ) : (
          <div className={cn(loading && "opacity-70 transition-opacity")}>
            {tab === "overview" ? <OverviewPanel data={overview} locale={locale} currency={currency} money={money} canPrepare={overview.perms.prepare} onTab={(k) => setTab(k as Tab)} />
              : tab === "people" ? <PeoplePanel data={people} money={money} locale={locale} canEdit={overview.perms.prepare} onChanged={reload} />
              : tab === "statutory" ? <StatutoryPanel data={rem} locale={locale} money={money} canPay={overview.perms.post} onChanged={reload} />
              : <MyPayslips items={mine?.items ?? []} locale={locale} money={money} />}
          </div>
        )}
      </div>
    </DashboardPageShell>
  );
}

export default function PayrollPage() {
  return <Suspense fallback={<div className="p-6"><Skeleton className="h-52 rounded-3xl" /></div>}><PayrollWorkspace /></Suspense>;
}
