"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Download, Loader2, Plus, Search, Siren, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import { InvoiceDrawer } from "./_components/InvoiceDrawer";
import { api, BUCKETS, shortDay, VIEWS, type Bucket, type Row, type Settings, type Snapshot, type Tone, type View } from "./_components/shared";

type Tab = "worklist" | "clients" | "settings";
const BUCKET_TONE: Record<Bucket, string> = { current: "bg-emerald-500", d1_30: "bg-amber-400", d31_60: "bg-orange-500", d61_90: "bg-rose-500", d90_plus: "bg-rose-700" };

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-xs">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums sm:text-2xl", tone === "good" && "text-emerald-600 dark:text-emerald-400", tone === "warn" && "text-amber-600 dark:text-amber-400", tone === "bad" && "text-rose-600 dark:text-rose-400")}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export default function CollectionsPage() {
  const t = useTranslations("Collections");
  const { fCurrency, locale } = useFormat();
  const money = useMemo(() => (n: number) => fCurrency(n), [fCurrency]);
  const [tab, setTab] = useState<Tab>("worklist");
  const [view, setView] = useState<View>("all");
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const initialQ = useSearchParams().get("q")?.slice(0, 80) ?? "";
  const [q, setQ] = useState(initialQ);
  const [qDebounced, setQDebounced] = useState(initialQ);
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);

  useEffect(() => { const h = setTimeout(() => setQDebounced(q), 250); return () => clearTimeout(h); }, [q]);
  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams();
    if (view !== "all") qs.set("view", view);
    if (bucket) qs.set("bucket", bucket);
    if (qDebounced) qs.set("q", qDebounced);
    api<Snapshot>(`/api/ar-collections?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null); setDraft((cur) => cur ?? d.settings); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [view, bucket, qDebounced, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const row = data?.rows.find((r) => r.id === openId) ?? null;
  const canEdit = data?.canEdit ?? false;
  const canSend = data?.canSend ?? false;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const bulk = async (action: "remind" | "snooze" | "escalate") => {
    setBusy(action);
    try {
      const res = await api<{ ok: number; skipped: Array<{ id: string; reason: string }> }>("/api/ar-collections/bulk", { method: "POST", body: JSON.stringify({ ids: [...selected], action, days: 7 }) });
      toast.success(t("bulkDone", { ok: res.ok, skipped: res.skipped.length }));
      setSelected(new Set()); reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("saveFailed")); } finally { setBusy(null); }
  };
  const runAuto = async () => {
    setBusy("auto");
    try {
      const r = await api<{ emailsSent: number; emailsFailed: number; skippedNoClientEmail: number; blocked?: string; brokenPromises: number }>("/api/ar-collections", { method: "POST", body: JSON.stringify({ action: "RUN_REMINDERS" }) });
      if (r.blocked === "SMTP_NOT_CONFIGURED") toast.error(t("smtpMissing")); else toast.success(t("autoDone", { sent: r.emailsSent, skipped: r.skippedNoClientEmail, failed: r.emailsFailed }));
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("saveFailed")); } finally { setBusy(null); }
  };
  const saveSettings = async () => {
    if (!draft) return;
    setBusy("settings");
    try { const next = await api<Settings>("/api/ar-collections/settings", { method: "PUT", body: JSON.stringify(draft) }); setDraft(next); toast.success(t("saved")); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("saveFailed")); } finally { setBusy(null); }
  };

  const actionLabel = (r: Row) => {
    const a = r.action;
    switch (a.kind) {
      case "REMIND": return t("action.REMIND", { tone: t(`tone_${a.tone ?? "friendly"}`) });
      case "WAIT_PROMISE": return t("action.WAIT_PROMISE", { date: shortDay(a.date ?? null, locale) });
      case "SNOOZED": return t("action.SNOOZED", { date: shortDay(a.date ?? null, locale) });
      default: return t(`action.${a.kind}`);
    }
  };
  const actionTone = (k: string) => (k === "REMIND" || k === "CALL" || k === "ESCALATE" ? "border-amber-500/40 text-amber-700 dark:text-amber-300" : k === "RESOLVE_DISPUTE" ? "border-rose-500/40 text-rose-700 dark:text-rose-300" : "text-muted-foreground");
  const totalBucket = Math.max(1, data?.buckets.reduce((s, b) => s + b.amount, 0) ?? 1);

  return (
    <DashboardPageShell
      title={t("title")} description={t("subtitle")} icon={<Siren className="h-6 w-6 text-primary" />}
      pageActions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild><a href="/api/ar-collections/export"><Download className="mr-1.5 h-4 w-4" />{t("export")}</a></Button>
          {canSend ? <Button size="sm" onClick={() => void runAuto()} disabled={busy === "auto"}>{busy === "auto" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}{t("runReminders")}</Button> : null}
        </div>
      }
    >
      <div className="space-y-5">
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label={t("title")}>
          {(["worklist", "clients", "settings"] as const).map((k) => <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{t(`tab.${k}`)}</button>)}
        </nav>

        {error && !data ? <div className="rounded-2xl border border-rose-500/30 p-8 text-center"><p className="font-medium">{t("loadFailed")}</p><Button className="mt-3" variant="outline" onClick={reload}>{t("retry")}</Button></div>
        : !data ? <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div><Skeleton className="h-72 rounded-2xl" /></div>
        : (
          <>
            {!data.smtpReminderReady ? <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">{t("smtpBanner")} <Link href="/settings" className="underline">{t("openSettings")}</Link></div> : null}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
              <Stat label={t("kpi.outstanding")} value={money(data.totals.totalOutstanding)} sub={t("kpi.current", { amount: money(data.totals.current) })} />
              <Stat label={t("kpi.overdue")} value={money(data.totals.overdueAmount)} tone={data.totals.overdueAmount > 0 ? "warn" : undefined} sub={t("kpi.invoices", { count: data.totals.overdueInvoices })} />
              <Stat label={t("kpi.collected")} value={money(data.totals.collectedLast30Days)} tone="good" sub={t("kpi.last30")} />
              <Stat label={t("kpi.dso")} value={data.totals.dso == null ? "—" : t("kpi.days", { count: data.totals.dso })} sub={t("kpi.dsoHint")} />
              <Stat label={t("kpi.promises")} value={money(data.totals.promisesDue.amount)} sub={t("kpi.promisesHint", { count: data.totals.promisesDue.count })} />
              <Stat label={t("kpi.atRisk")} value={money(data.totals.atRiskAmount)} tone={data.totals.atRiskAmount > 0 ? "bad" : undefined} sub={t("kpi.atRiskHint")} />
            </div>

            <section className="rounded-2xl border bg-card p-4">
              <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{t("aging")}</h2>{bucket ? <Button variant="ghost" size="sm" onClick={() => setBucket(null)}>{t("clearFilter")}</Button> : null}</div>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={t("aging")}>
                {data.buckets.map((b) => <div key={b.key} className={BUCKET_TONE[b.key]} style={{ width: `${(b.amount / totalBucket) * 100}%` }} />)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {BUCKETS.map((k) => { const b = data.buckets.find((x) => x.key === k)!; return (
                  <button key={k} type="button" onClick={() => { setBucket(bucket === k ? null : k); setTab("worklist"); }} className={cn("rounded-xl border p-3 text-left transition-colors hover:bg-muted/50", bucket === k && "border-primary bg-primary/5")}>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className={cn("h-2 w-2 rounded-full", BUCKET_TONE[k])} />{t(`bucket.${k}`)}</span>
                    <span className="mt-1 block font-semibold tabular-nums">{money(b.amount)}</span><span className="text-xs text-muted-foreground">{t("kpi.invoices", { count: b.count })}</span>
                  </button>); })}
              </div>
            </section>

            {tab === "worklist" ? (
              <section className="space-y-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                  <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="pl-9" aria-label={t("search")} /></div>
                  <div className="flex flex-wrap gap-1.5">
                    {VIEWS.map((v) => <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cn("rounded-full border px-3 py-1 text-sm transition-colors", view === v ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>{t(`view.${v}`)}{v === "broken" && data.totals.brokenPromises.count ? <span className="ml-1 text-rose-600">{data.totals.brokenPromises.count}</span> : null}{v === "actionable" ? <span className="ml-1 text-muted-foreground">{data.totals.actionable}</span> : null}</button>)}
                  </div>
                </div>

                {selected.size > 0 && canEdit ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
                    <span className="font-medium">{t("selected", { count: selected.size })}</span>
                    {canSend ? <Button size="sm" disabled={!!busy} onClick={() => void bulk("remind")}>{t("bulkRemind")}</Button> : null}
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void bulk("snooze")}>{t("bulkSnooze")}</Button>
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void bulk("escalate")}>{t("escalate")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t("clear")}</Button>
                  </div>
                ) : null}

                {data.rows.length === 0 ? <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">{loading ? "…" : t("empty")}</div> : (
                  <ul className={cn("divide-y overflow-hidden rounded-2xl border bg-card", loading && "opacity-70")}>
                    {data.rows.map((r) => (
                      <li key={r.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center sm:gap-4">
                        {canEdit ? <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={t("select", { number: r.invoiceNumber })} /> : <span />}
                        <button type="button" onClick={() => setOpenId(r.id)} className="min-w-0 text-left">
                          <p className="truncate text-sm font-medium">{r.clientName} <span className="font-normal text-muted-foreground">· {r.invoiceNumber}</span></p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span>{r.daysOverdue > 0 ? t("overdueDays", { count: r.daysOverdue }) : t("dueOn", { date: shortDay(r.dueDate, locale) })}</span>
                            <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px] font-normal", actionTone(r.action.kind))}>{actionLabel(r)}</Badge>
                            {r.followUpStatus !== "UNTOUCHED" ? <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">{t(`status.${r.followUpStatus}`)}</Badge> : null}
                            <span className={cn(r.risk >= 70 ? "text-rose-600" : r.risk >= 45 ? "text-amber-600" : "")}>{t("risk", { score: r.risk })}</span>
                          </p>
                        </button>
                        <p className="text-right text-sm font-semibold tabular-nums">{money(r.outstanding)}</p>
                        <div className="flex justify-end">{canEdit ? <Button size="sm" variant="outline" onClick={() => setOpenId(r.id)}>{t("manage")}</Button> : null}</div>
                      </li>
                    ))}
                  </ul>
                )}
                {data.truncated ? <p className="text-xs text-muted-foreground">{t("truncated")}</p> : null}
              </section>
            ) : null}

            {tab === "clients" ? (
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {data.clients.length === 0 ? <li className="p-10 text-center text-sm text-muted-foreground">{t("empty")}</li> : data.clients.map((c) => (
                  <li key={c.clientId ?? c.name} className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6">
                    <div className="min-w-0">
                      {c.clientId ? <Link href={`/clients/${c.clientId}`} className="truncate text-sm font-medium hover:underline">{c.name}</Link> : <p className="truncate text-sm font-medium">{c.name}</p>}
                      <p className="text-xs text-muted-foreground">{t("clientLine", { invoices: c.invoices, days: c.oldestDays })}{c.creditLimit != null && c.outstanding > c.creditLimit ? <span className="ml-2 text-rose-600">{t("overLimit", { limit: money(c.creditLimit) })}</span> : null}</p>
                    </div>
                    <p className="text-sm tabular-nums"><span className="text-muted-foreground">{t("kpi.overdue")} </span>{money(c.overdue)}</p>
                    <p className="text-right text-sm font-semibold tabular-nums">{money(c.outstanding)}</p>
                  </li>
                ))}
              </ul>
            ) : null}

            {tab === "settings" && draft ? (
              <section className="space-y-5 rounded-3xl border bg-card p-5">
                <div><h2 className="text-base font-semibold">{t("ladderTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("ladderHint")}</p></div>
                <label className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm"><span>{t("autoReminders")}<span className="block text-xs text-muted-foreground">{t("autoRemindersHint")}</span></span><Switch disabled={!canEdit} checked={draft.autoReminders} onCheckedChange={(v) => setDraft({ ...draft, autoReminders: v })} /></label>
                <div className="space-y-2">
                  {draft.steps.map((s, i) => (
                    <div key={i} className="grid grid-cols-[1fr_9rem_auto] items-end gap-2 sm:grid-cols-[12rem_12rem_auto]">
                      <div><Label className="text-xs" htmlFor={`st-${i}`}>{t("stepAfter", { n: i + 1 })}</Label><Input id={`st-${i}`} type="number" min="1" max="365" disabled={!canEdit} value={s.afterDays} onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, afterDays: Number(e.target.value) } : x)) })} /></div>
                      <Select disabled={!canEdit} value={s.tone} onValueChange={(v) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, tone: v as Tone } : x)) })}><SelectTrigger aria-label={t("tone")}><SelectValue /></SelectTrigger><SelectContent>{(["friendly", "firm", "final"] as const).map((x) => <SelectItem key={x} value={x}>{t(`tone_${x}`)}</SelectItem>)}</SelectContent></Select>
                      <Button variant="ghost" size="icon" disabled={!canEdit || draft.steps.length <= 1} onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })} aria-label={t("remove")}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  {canEdit && draft.steps.length < 6 ? <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { afterDays: (draft.steps.at(-1)?.afterDays ?? 0) + 14, tone: "final" }] })}><Plus className="h-4 w-4" />{t("addStep")}</Button> : null}
                </div>
                <div className="max-w-xs"><Label className="text-xs" htmlFor="gap">{t("minGap")}</Label><Input id="gap" type="number" min="1" max="60" disabled={!canEdit} value={draft.minGapDays} onChange={(e) => setDraft({ ...draft, minGapDays: Number(e.target.value) })} /><p className="mt-1 text-[11px] text-muted-foreground">{t("minGapHint")}</p></div>
                <label className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm"><span>{t("pauseOnPromise")}<span className="block text-xs text-muted-foreground">{t("pauseOnPromiseHint")}</span></span><Switch disabled={!canEdit} checked={draft.pauseOnPromise} onCheckedChange={(v) => setDraft({ ...draft, pauseOnPromise: v })} /></label>
                {canEdit ? <Button onClick={() => void saveSettings()} disabled={busy === "settings"}>{busy === "settings" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t("save")}</Button> : <p className="text-xs text-muted-foreground">{t("viewOnly")}</p>}
              </section>
            ) : null}
          </>
        )}
      </div>
      <InvoiceDrawer row={row} locale={locale} money={money} canEdit={canEdit} canSend={canSend} onClose={() => setOpenId(null)} onChanged={reload} />
    </DashboardPageShell>
  );
}
