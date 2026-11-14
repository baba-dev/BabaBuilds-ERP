"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Landmark, Settings2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import { InboxPanel } from "./_components/InboxPanel";
import { MatchedPanel } from "./_components/MatchedPanel";
import { api, money, shortDate, type Account, type Summary } from "./_components/shared";

type Tab = "inbox" | "matched" | "ignored";
const TABS: Tab[] = ["inbox", "matched", "ignored"];

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-xs">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "good" && "text-emerald-600 dark:text-emerald-400", tone === "warn" && "text-amber-600 dark:text-amber-400")}>{value}</p>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Workspace() {
  const t = useTranslations("BankWorkspace");
  const sp = useSearchParams();
  const { locale, currency: baseCurrency } = useFormat();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tab, setTab] = useState<Tab>("inbox");
  const [canCommit, setCanCommit] = useState(true);
  const [version, setVersion] = useState(0);
  const focusId = sp.get("txId");

  useEffect(() => { api<{ data: Account[] }>("/api/reconcile/bank-accounts").then((r) => { if (r.ok) setAccounts(r.data.data ?? []); }); }, []);
  const loadSummary = useCallback(async () => {
    const r = await api<{ data: Summary }>(`/api/reconcile/summary${accountId ? `?accountId=${accountId}` : ""}`);
    if (r.ok) { setSummary(r.data.data); setCanCommit(r.data.data.canCommit !== false); }
  }, [accountId]);
  useEffect(() => { void loadSummary(); }, [loadSummary, version]);

  const currency = summary?.currency ?? accounts.find((a) => a.id === accountId)?.currency ?? baseCurrency ?? "INR";
  const m = (n: number) => money(n, currency, locale);
  const changed = () => setVersion((v) => v + 1);

  return (
    <DashboardPageShell
      title={t("title")}
      description={t("subtitle")}
      icon={<Landmark className="size-6 text-accent-strong" aria-hidden />}
      animated={false}
      primaryAction={<Button asChild><Link href="/reconciliation/import"><Upload className="mr-2 size-4" aria-hidden />{t("importStatement")}</Link></Button>}
      secondaryActions={<Button variant="outline" asChild><Link href="/reconciliation/settings"><Settings2 className="mr-2 size-4" aria-hidden />{t("rules")}</Link></Button>}
    >
      {accounts.length > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor="rw-account" className="text-sm text-muted-foreground">{t("account")}</label>
          <select id="rw-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t("allAccounts")}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.bankName ? ` · ${a.bankName}` : ""}</option>)}
          </select>
        </div>
      )}

      <section aria-label={t("summary")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary ? (<>
          <Stat label={t("stats.waiting")} value={String(summary.waiting)} tone={summary.waiting > 0 ? "warn" : "good"} sub={t("stats.inOut", { inAmount: m(summary.waitingCredit.amount), outAmount: m(summary.waitingDebit.amount) })} />
          <Stat label={t("stats.reconciled")} value={`${summary.reconciledPercent}%`} tone={summary.reconciledPercent >= 95 ? "good" : undefined} sub={<div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={summary.reconciledPercent} aria-valuemin={0} aria-valuemax={100} aria-label={t("stats.reconciled")}><div className="h-full rounded-full bg-emerald-500" style={{ width: `${summary.reconciledPercent}%` }} /></div>} />
          <Stat label={t("stats.oldest")} value={summary.oldestWaitingDays === null ? "—" : t("days", { count: summary.oldestWaitingDays })} tone={summary.oldestWaitingDays !== null && summary.oldestWaitingDays > 30 ? "warn" : undefined} sub={summary.oldestWaitingDays === null ? t("stats.allClear") : t("stats.oldestHelp")} />
          <Stat label={summary.balance !== null ? t("stats.balance") : t("stats.lastImport")} value={summary.balance !== null ? m(summary.balance) : summary.lastImport ? shortDate(summary.lastImport.at, locale) : "—"} sub={summary.lastImport ? t("stats.imported", { rows: summary.lastImport.rows, date: shortDate(summary.lastImport.at, locale) }) : t("stats.noImport")} />
        </>) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[96px] rounded-2xl" />)}
      </section>

      {summary && summary.total === 0 ? (
        <div className="grid place-items-center rounded-3xl border border-dashed p-12 text-center">
          <div className="max-w-sm space-y-3"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-600"><Landmark className="size-7" aria-hidden /></div><h2 className="text-lg font-semibold">{t("empty.title")}</h2><p className="text-sm text-muted-foreground">{t("empty.body")}</p><Button asChild><Link href="/reconciliation/import"><Upload className="mr-2 size-4" aria-hidden />{t("importStatement")}</Link></Button></div>
        </div>
      ) : (<>
        <div role="tablist" aria-label={t("tabs.label")} className="flex gap-1 overflow-x-auto border-b">
          {TABS.map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors", tab === k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t(`tabs.${k}` as never)}
              {summary && k === "inbox" && summary.waiting > 0 && <span className="ms-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{summary.waiting}</span>}
              {summary && k === "matched" && <span className="ms-1.5 text-xs text-muted-foreground">{summary.reconciled}</span>}
              {summary && k === "ignored" && summary.ignored > 0 && <span className="ms-1.5 text-xs text-muted-foreground">{summary.ignored}</span>}
            </button>
          ))}
        </div>
        {tab === "inbox" && <InboxPanel key={`inbox-${accountId}-${version}`} accountId={accountId} view="waiting" locale={locale} canCommit={canCommit} focusId={focusId} onChanged={changed} />}
        {tab === "ignored" && <InboxPanel key={`ignored-${accountId}-${version}`} accountId={accountId} view="ignored" locale={locale} canCommit={canCommit} focusId={null} onChanged={changed} />}
        {tab === "matched" && <MatchedPanel key={`matched-${accountId}-${version}`} accountId={accountId} locale={locale} currency={currency} canCommit={canCommit} onChanged={changed} />}
      </>)}
    </DashboardPageShell>
  );
}

export default function ReconciliationPage() {
  return <Suspense fallback={null}><Workspace /></Suspense>;
}
