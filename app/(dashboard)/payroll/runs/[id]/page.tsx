"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Banknote, CheckCircle2, ChevronDown, ChevronRight, Download, FileText, Landmark, Loader2, Mail, RotateCcw, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import { PaidArt } from "../../_components/art/PayrollArt";
import { IssueList } from "../../_components/IssueList";
import { RunLineDrawer } from "../../_components/RunLineDrawer";
import { STATUS_TONE, api, dayLabel, monthLabel, type RunDetailDto, type RunLineDto } from "../../_components/shared";

type Detail = NonNullable<RunDetailDto>;
const TABS = ["employees", "statutory", "payout", "activity"] as const;
type Tab = (typeof TABS)[number];
const STEPS = ["DRAFT", "REVIEW", "APPROVED", "POSTED", "PAID"] as const;

function Delta({ now, before, money, t }: { now: number; before: number | null | undefined; money: (n: number) => string; t: ReturnType<typeof useTranslations> }) {
  if (before == null) return null;
  const d = now - before;
  if (Math.abs(d) < 1) return <p className="mt-0.5 text-xs text-muted-foreground">{t("run.sameAsLast")}</p>;
  return <p className={cn("mt-0.5 text-xs", d > 0 ? "text-amber-600" : "text-emerald-600")}>{d > 0 ? "▲" : "▼"} {money(Math.abs(d))} {t("run.vsLast")}</p>;
}

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("PayrollHub");
  const { fCurrency, locale } = useFormat();
  const money = useMemo(() => (n: number) => fCurrency(n), [fCurrency]);
  const [run, setRun] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("employees");
  const [busy, setBusy] = useState<string | null>(null);
  const [line, setLine] = useState<RunLineDto | null>(null);
  const [showIssues, setShowIssues] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(() => api<Detail>(`/api/payroll/runs/${id}`).then((d) => { setRun(d); setError(null); }).catch((e) => setError(e instanceof Error ? e.message : "error")), [id]);
  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, url: string, body: unknown, ok: string) => {
    setBusy(key);
    try { await api(url, { method: "POST", body: JSON.stringify(body) }); toast.success(ok); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("run.actionFailed")); } finally { setBusy(null); }
  };
  const transition = (action: string, ok: string) => act(action, `/api/payroll/runs/${id}/transition`, { action }, ok);

  const sendSlips = async () => {
    setBusy("slips");
    try {
      const r = await api<{ sent: number; skipped: unknown[]; failed: unknown[] }>(`/api/payroll/runs/${id}/payslips/send`, { method: "POST", body: JSON.stringify({}) });
      toast.success(t("run.slipsSent", { sent: r.sent, skipped: r.skipped.length + r.failed.length })); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("run.actionFailed")); } finally { setBusy(null); }
  };

  const filtered = useMemo(() => (run?.lines ?? []).filter((l) => !q.trim() || l.employee.name.toLowerCase().includes(q.toLowerCase()) || (l.employee.code ?? "").toLowerCase().includes(q.toLowerCase())), [run, q]);
  const stat = useMemo(() => {
    const sum = (k: string) => Math.round((run?.lines ?? []).reduce((s, l) => s + (l.statutory[k] ?? 0), 0) * 100) / 100;
    return { pfEmployee: sum("pfEmployee"), pfEmployer: sum("pfEpf") + sum("pfEps") + sum("pfAdmin") + sum("pfEdli"), esiEmployee: sum("esiEmployee"), esiEmployer: sum("esiEmployer"), pt: sum("pt"), tds: sum("tds") };
  }, [run]);

  if (error && !run) return <DashboardPageShell title={t("title")}><div className="mx-auto max-w-lg rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8 text-center"><p className="font-medium">{t("run.loadFailed")}</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button asChild className="mt-4" variant="outline"><Link href="/payroll">{t("wizard.back")}</Link></Button></div></DashboardPageShell>;
  if (!run) return <DashboardPageShell title={t("title")}><div className="space-y-4"><Skeleton className="h-24 rounded-3xl" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div><Skeleton className="h-80 rounded-3xl" /></div></DashboardPageShell>;

  const c = run.capabilities;
  const month = monthLabel(run.period.startDate, locale);
  const paid = run.status === "POSTED" && run.payout.pendingCount === 0;
  const stepIndex = paid ? 4 : STEPS.indexOf(run.status as (typeof STEPS)[number]);
  const hasErrors = run.issues.some((i) => i.severity === "error" && i.code !== "NO_COMPENSATION");
  const dlUrl = (type: string) => `/api/payroll/runs/${id}/export?type=${type}`;

  return (
    <DashboardPageShell
      title={t("run.title", { month })}
      description={t("run.subtitle", { version: run.version, count: run.headcount.included })}
      icon={<FileText className="h-6 w-6 text-primary" />}
      pageActions={<div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="gap-1.5"><Link href="/payroll"><ArrowLeft className="h-4 w-4" />{t("wizard.back")}</Link></Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><Download className="h-4 w-4" />{t("run.downloads")}<ChevronDown className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><a href={dlUrl("register")}>{t("run.dl.register")}</a></DropdownMenuItem>
            {c.canExport && (run.status === "APPROVED" || run.status === "POSTED") ? <><DropdownMenuItem asChild><a href={dlUrl("bank")}>{t("run.dl.bank")}</a></DropdownMenuItem><DropdownMenuItem asChild><a href={dlUrl("ecr")}>{t("run.dl.ecr")}</a></DropdownMenuItem><DropdownMenuItem asChild><a href={dlUrl("esi")}>{t("run.dl.esi")}</a></DropdownMenuItem></> : null}
          </DropdownMenuContent></DropdownMenu>
      </div>}
    >
      <div className="space-y-5">
        <section className="rounded-3xl border bg-card p-4 shadow-xs sm:p-5">
          <ol className="flex items-center gap-1 overflow-x-auto pb-1">
            {STEPS.map((s, i) => (
              <li key={s} className="flex min-w-fit flex-1 items-center gap-2">
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i < stepIndex || paid ? "bg-emerald-500 text-white" : i === stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{i < stepIndex || (paid && i === 4) ? <CheckCircle2 className="h-4 w-4" /> : i + 1}</span>
                <span className={cn("text-xs sm:text-sm", i === stepIndex ? "font-medium" : "text-muted-foreground")}>{t(`status.${s}`)}</span>
                {i < STEPS.length - 1 ? <span className={cn("h-px min-w-4 flex-1", i < stepIndex ? "bg-emerald-500" : "bg-border")} /> : null}
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_TONE[paid ? "POSTED" : run.status])}>{t(`status.${paid ? "PAID" : run.status}`)}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              {c.canRegenerate ? <Button asChild variant="outline" size="sm" className="gap-1.5"><Link href={`/payroll/new?year=${new Date(run.period.startDate).getUTCFullYear()}&month=${new Date(run.period.startDate).getUTCMonth() + 1}`}><RotateCcw className="h-4 w-4" />{t("run.recalculate")}</Link></Button> : null}
              {c.canSubmitReview ? <Button size="sm" disabled={busy !== null || hasErrors} onClick={() => void transition("submit_review", t("run.submitted"))} className="gap-1.5">{busy === "submit_review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{t("run.submit")}</Button> : null}
              {c.canReturnDraft ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void transition("return_draft", t("run.returned"))}>{t("run.sendBack")}</Button> : null}
              {c.canReturnReview ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void transition("return_review", t("run.returned"))}>{t("run.sendBack")}</Button> : null}
              {c.canApprove ? <Button size="sm" disabled={busy !== null} onClick={() => void transition("approve", t("run.approved"))} className="gap-1.5">{busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}{t("run.approve")}</Button> : null}
              {c.canPost ? <Button size="sm" disabled={busy !== null} onClick={() => void act("post", `/api/payroll/runs/${id}/post`, {}, t("run.posted"))} className="gap-1.5">{busy === "post" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}{t("run.post")}</Button> : null}
              {c.canDisburse ? <Button size="sm" disabled={busy !== null} onClick={() => setPayOpen(true)} className="gap-1.5"><Banknote className="h-4 w-4" />{t("run.markPaid")}</Button> : null}
            </div>
          </div>
          {run.status === "REVIEW" && !c.canApprove ? <p className="mt-3 text-xs text-muted-foreground">{t("run.waitingApproval")}</p> : null}
        </section>

        {run.stale && run.status === "DRAFT" ? <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><div><p className="font-medium">{t("run.staleTitle")}</p><p className="text-xs text-muted-foreground">{t("run.staleBody")}</p></div></div> : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border bg-card p-4 shadow-xs"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("run.gross")}</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(run.totals.gross)}</p><Delta now={run.totals.gross} before={run.previous?.gross} money={money} t={t} /></div>
          <div className="rounded-2xl border bg-card p-4 shadow-xs"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("run.deductions")}</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(run.totals.deductions)}</p></div>
          <div className="rounded-2xl border bg-card p-4 shadow-xs"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("run.net")}</p><p className="mt-1 text-xl font-semibold tabular-nums text-emerald-600">{money(run.totals.netPay)}</p><Delta now={run.totals.netPay} before={run.previous?.netPay} money={money} t={t} /></div>
          <div className="rounded-2xl border bg-card p-4 shadow-xs"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("run.employer")}</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(run.totals.employerCost)}</p><p className="mt-0.5 text-xs text-muted-foreground">{t("run.totalCost", { amount: money(run.totals.gross + run.totals.employerCost) })}</p></div>
        </div>

        {run.issues.length > 0 ? (
          <section className="rounded-3xl border bg-card p-5 shadow-xs">
            <button type="button" onClick={() => setShowIssues((v) => !v)} className="flex w-full items-center justify-between text-left"><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-indigo-500" />{t("run.checks", { count: run.issues.length })}</h3>{showIssues ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
            {showIssues ? <div className="mt-3"><IssueList issues={run.issues} /></div> : null}
          </section>
        ) : null}

        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1">{TABS.map((k) => <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{t(`run.tab.${k}`)}</button>)}</nav>

        {tab === "employees" && (
          <section className="space-y-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("people.search")} className="max-w-sm" aria-label={t("people.search")} />
            <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
              <table className="w-full text-sm"><thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">{t("people.col.person")}</th><th className="px-4 py-3 text-right">{t("run.gross")}</th><th className="px-4 py-3 text-right">{t("run.deductions")}</th><th className="px-4 py-3 text-right">{t("run.net")}</th><th className="px-4 py-3">{t("run.payment")}</th><th className="w-8" /></tr></thead>
                <tbody className="divide-y">{filtered.map((l) => (
                  <tr key={l.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setLine(l)}>
                    <td className="px-4 py-3"><p className="font-medium">{l.employee.name}</p><p className="text-xs text-muted-foreground">{[l.employee.code, l.employee.department].filter(Boolean).join(" · ")}{l.lopDays > 0 ? ` · ${t("wizard.lop", { days: l.lopDays })}` : ""}</p></td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(l.gross)}</td><td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{money(l.deductions)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(l.netPay)}</td>
                    <td className="px-4 py-3"><span className={cn("rounded-full px-2 py-0.5 text-xs", l.payoutStatus === "PAID" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>{t(`run.payout.${l.payoutStatus}`)}</span>{l.warnings.length > 0 ? <TriangleAlert className="ml-2 inline h-3.5 w-3.5 text-amber-600" /> : null}</td>
                    <td className="pr-3 text-muted-foreground"><ChevronRight className="h-4 w-4" /></td>
                  </tr>))}</tbody></table>
            </div>
            <ul className="space-y-2 md:hidden">{filtered.map((l) => <li key={l.id}><button type="button" onClick={() => setLine(l)} className="flex w-full items-center justify-between gap-3 rounded-2xl border bg-card p-3 text-left"><span className="min-w-0"><span className="block truncate text-sm font-medium">{l.employee.name}</span><span className="block text-xs text-muted-foreground">{t("run.grossShort", { amount: money(l.gross) })}</span></span><span className="text-right"><span className="block text-sm font-semibold tabular-nums">{money(l.netPay)}</span><span className="text-[11px] text-muted-foreground">{t(`run.payout.${l.payoutStatus}`)}</span></span></button></li>)}</ul>
          </section>
        )}

        {tab === "statutory" && (
          <section className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[["PF", stat.pfEmployee, stat.pfEmployer], ["ESI", stat.esiEmployee, stat.esiEmployer], ["PT", stat.pt, 0], ["TDS", stat.tds, 0]].map(([k, emp, er]) => (
                <div key={String(k)} className="rounded-2xl border bg-card p-4 shadow-xs"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`kind.${k}`)}</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(Number(emp) + Number(er))}</p>{Number(er) > 0 ? <p className="mt-0.5 text-xs text-muted-foreground">{t("run.employeeEmployer", { employee: money(Number(emp)), employer: money(Number(er)) })}</p> : null}</div>
              ))}
            </div>
            <div className="rounded-3xl border bg-card p-5 shadow-xs">
              <h3 className="text-sm font-semibold">{t("run.remittances")}</h3>
              {run.remittances.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t("run.remittancesEmpty")}</p> : <ul className="mt-3 divide-y">{run.remittances.map((r) => <li key={r.id} className="flex items-center justify-between py-2.5 text-sm"><span>{t(`kind.${r.kind}`)}<span className="block text-xs text-muted-foreground">{r.status === "PAID" ? t("statutory.paidOn", { date: dayLabel(r.paidAt, locale) }) : t("overview.dueOn", { date: dayLabel(r.dueDate, locale) })}</span></span><span className="flex items-center gap-3"><span className="tabular-nums">{money(r.amount)}</span><span className={cn("rounded-full px-2 py-0.5 text-xs", r.status === "PAID" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300")}>{r.status === "PAID" ? t("statutory.statusPaid") : t("statutory.statusDue")}</span></span></li>)}</ul>}
              <Button asChild variant="link" className="mt-2 h-auto p-0 text-xs"><Link href="/payroll?tab=statutory">{t("run.goStatutory")}</Link></Button>
            </div>
          </section>
        )}

        {tab === "payout" && (
          <section className="space-y-4">
            {paid ? <div className="grid items-center gap-3 rounded-3xl border bg-gradient-to-br from-emerald-500/10 to-transparent p-6 md:grid-cols-[1fr_220px]"><div><h3 className="text-lg font-semibold">{t("run.allPaidTitle")}</h3><p className="mt-1 text-sm text-muted-foreground">{t("run.allPaidBody", { date: dayLabel(run.timeline.disbursedAt, locale) })}</p></div><div className="hidden h-32 md:block"><PaidArt /></div></div> : (
              <div className="rounded-3xl border bg-card p-5 shadow-xs">
                <h3 className="text-sm font-semibold">{t("run.payoutTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{run.status === "POSTED" ? t("run.payoutReady", { count: run.payout.pendingCount, amount: money(run.payout.pendingAmount) }) : t("run.payoutLocked")}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {c.canExport && (run.status === "APPROVED" || run.status === "POSTED") ? <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={dlUrl("bank")}><Download className="h-4 w-4" />{t("run.dl.bank")}</a></Button> : null}
                  {c.canDisburse ? <Button size="sm" className="gap-1.5" onClick={() => setPayOpen(true)}><Banknote className="h-4 w-4" />{t("run.markPaid")}</Button> : null}
                </div>
              </div>
            )}
            {c.canExport && (run.status === "APPROVED" || run.status === "POSTED") ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border bg-card p-5 shadow-xs"><div><h3 className="text-sm font-semibold">{t("run.slipsTitle")}</h3><p className="text-xs text-muted-foreground">{t("run.slipsBody", { sent: run.lines.filter((l) => l.payslipSentAt).length, total: run.lines.length })}</p></div><Button variant="outline" size="sm" className="gap-1.5" disabled={busy !== null} onClick={() => void sendSlips()}>{busy === "slips" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}{t("run.sendSlips")}</Button></div> : null}
          </section>
        )}

        {tab === "activity" && (
          <section className="rounded-3xl border bg-card p-5 shadow-xs">
            <ol className="relative space-y-4 border-l pl-5">
              {[
                { k: "generated", at: run.timeline.generatedAt, who: run.people.preparedBy?.name },
                { k: "submitted", at: run.timeline.submittedAt, who: run.people.preparedBy?.name },
                { k: "approved", at: run.timeline.approvedAt, who: run.people.approvedBy?.name },
                { k: "posted", at: run.timeline.postedAt, who: null, extra: run.posting?.journalReference },
                { k: "paid", at: run.timeline.disbursedAt, who: run.people.disbursedBy?.name },
              ].filter((e) => e.at).map((e) => <li key={e.k} className="relative"><span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" /><p className="text-sm font-medium">{t(`run.event.${e.k}`)}</p><p className="text-xs text-muted-foreground">{dayLabel(e.at, locale)}{e.who ? ` · ${e.who}` : ""}{"extra" in e && e.extra ? ` · ${e.extra}` : ""}</p></li>)}
            </ol>
          </section>
        )}
      </div>

      <RunLineDrawer line={line} runId={id} open={Boolean(line)} onOpenChange={(v) => !v && setLine(null)} money={money} />
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("run.payDialogTitle")}</DialogTitle><DialogDescription>{t("run.payDialogBody", { count: run.payout.pendingCount, amount: money(run.payout.pendingAmount) })}</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><label className="text-xs font-medium">{t("run.payReference")}</label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("run.payReferencePlaceholder")} maxLength={80} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setPayOpen(false)}>{t("common.cancel")}</Button><Button disabled={busy !== null} onClick={() => { setPayOpen(false); void act("disburse", `/api/payroll/runs/${id}/disburse`, { reference }, t("run.paidDone")); }}>{t("run.confirmPaid")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPageShell>
  );
}
