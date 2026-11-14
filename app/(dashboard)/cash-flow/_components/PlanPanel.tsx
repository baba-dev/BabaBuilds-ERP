"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, ApiError, dayLabel, SCENARIOS, type AccountRow, type AdjustmentRow, type Assumptions, type Scenario } from "./shared";

const KNOWN_ERR = new Set(["DATE", "DATE_RANGE", "AMOUNT", "AMOUNT_RANGE", "DIRECTION", "REQUIRED", "TOO_LONG"]);
type Standing = NonNullable<Assumptions["recurringOutflows"]>;
const FIELDS = ["collectionsDelayDays", "inflowHaircutPercent", "outflowIncreasePercent", "movePOEarlierLaterDays", "defaultInvoicePaymentTermsDays", "overdueCollectionDays"] as const;
const dateInput = (iso: string) => iso.slice(0, 10);

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border bg-card p-5"><h2 className="text-base font-semibold">{title}</h2>{hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}<div className="mt-4">{children}</div></section>;
}

export function PlanPanel({ locale, money, canEdit, onChanged }: { locale: string; money: (n: number) => string; canEdit: boolean; onChanged: () => void }) {
  const t = useTranslations("CashFlow");
  const [assumptions, setAssumptions] = useState<Record<Scenario, Assumptions> | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[] | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [prefs, setPrefs] = useState<{ criticalEnabled: boolean; warningEnabled: boolean; infoEnabled: boolean } | null>(null);
  const [tag, setTag] = useState<Scenario>("BASE");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [standing, setStanding] = useState<Standing>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [adj, setAdj] = useState({ date: "", amount: "", direction: "OUTFLOW", reason: "", category: "" });
  const [acc, setAcc] = useState({ name: "", openingBalance: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fill = useCallback((a: Record<Scenario, Assumptions>, which: Scenario) => {
    setDraft({ ...Object.fromEntries(FIELDS.map((f) => [f, String(a[which][f] ?? "")])), minimumCashThreshold: String(a.BASE.minimumCashThreshold ?? 0) });
    setStanding(a[which].recurringOutflows ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<Record<Scenario, Assumptions>>("/api/cash-flow/assumptions"), api<AdjustmentRow[]>("/api/cash-flow/manual-adjustments"), api<AccountRow[]>("/api/cash-flow/bank-accounts"), api<NonNullable<typeof prefs>>("/api/cash-flow/alert-preferences"),
    ]).then(([a, m, b, p]) => {
      if (cancelled) return;
      setAssumptions(a); setAdjustments(m); setAccounts(b); setPrefs(p); fill(a, "BASE");
    }).catch(() => { if (!cancelled) toast.error(t("loadFailed")); });
    return () => { cancelled = true; };
  }, [fill, t]);

  const selectTag = (s: Scenario) => { setTag(s); if (assumptions) fill(assumptions, s); };

  const guard = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setErrors({});
    try { await fn(); onChanged(); } catch (e) {
      if (e instanceof ApiError && e.fields.length) setErrors(Object.fromEntries(e.fields.map((f) => [f.field, t(`err.${KNOWN_ERR.has(f.code) ? f.code : "GENERIC"}`)])));
      toast.error(e instanceof Error ? e.message : t("saveFailed"));
    } finally { setBusy(null); }
  };

  if (!assumptions || !adjustments || !accounts || !prefs) return <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-3xl" />)}</div>;
  const dis = !canEdit;

  const saveAssumptions = () => guard("assume", async () => {
    const values = { ...Object.fromEntries(FIELDS.map((f) => [f, Number(draft[f])])), recurringOutflows: standing.filter((s) => s.title.trim() && s.amount > 0) };
    await api("/api/cash-flow/assumptions", { method: "POST", body: JSON.stringify({ scenarioTag: tag, values }) });
    // The cash cushion is shared by all scenarios, so it is stored on the base scenario.
    const baseValues = { ...assumptions.BASE, ...(tag === "BASE" ? values : {}), minimumCashThreshold: Number(draft.minimumCashThreshold) || 0 };
    await api("/api/cash-flow/assumptions", { method: "POST", body: JSON.stringify({ scenarioTag: "BASE", values: baseValues }) });
    const fresh = await api<Record<Scenario, Assumptions>>("/api/cash-flow/assumptions"); setAssumptions(fresh); fill(fresh, tag); toast.success(t("saved"));
  });

  return (
    <div className="space-y-6">
      <Section title={t("plan.accountsTitle")} hint={t("plan.accountsHint")}>
        {accounts.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{t("plan.noAccounts")}</p> : (
          <ul className="divide-y rounded-2xl border">
            {accounts.map((a) => <AccountRowEditor key={a.id} a={a} locale={locale} money={money} disabled={dis} onSave={(body) => guard(`acc-${a.id}`, async () => { await api(`/api/cash-flow/bank-accounts/${a.id}`, { method: "PATCH", body: JSON.stringify(body) }); setAccounts(await api("/api/cash-flow/bank-accounts")); toast.success(t("saved")); })} />)}
          </ul>
        )}
        {canEdit ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
            <Input placeholder={t("plan.accountName")} value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} aria-label={t("plan.accountName")} />
            <Input type="number" inputMode="decimal" placeholder={t("plan.openingBalance")} value={acc.openingBalance} onChange={(e) => setAcc({ ...acc, openingBalance: e.target.value })} aria-label={t("plan.openingBalance")} />
            <Button variant="outline" disabled={!acc.name.trim() || busy === "newacc"} onClick={() => void guard("newacc", async () => { await api("/api/cash-flow/bank-accounts", { method: "POST", body: JSON.stringify({ name: acc.name, openingBalance: Number(acc.openingBalance) || 0 }) }); setAcc({ name: "", openingBalance: "" }); setAccounts(await api("/api/cash-flow/bank-accounts")); toast.success(t("saved")); })}><Plus className="mr-1.5 h-4 w-4" />{t("plan.addAccount")}</Button>
          </div>
        ) : null}
      </Section>

      <Section title={t("plan.assumptionsTitle")} hint={t("plan.assumptionsHint")}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {SCENARIOS.map((s) => <button key={s} type="button" onClick={() => selectTag(s)} className={cn("rounded-full border px-3 py-1 text-sm transition-colors", tag === s ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>{t(`scenario.${s}`)}</button>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3"><Label htmlFor="pl-min" className="text-xs">{t("plan.cushion")}</Label><Input id="pl-min" type="number" inputMode="decimal" min="0" disabled={dis} value={draft.minimumCashThreshold ?? ""} onChange={(e) => setDraft({ ...draft, minimumCashThreshold: e.target.value })} className="max-w-xs" /><p className="mt-1 text-[11px] text-muted-foreground">{t("plan.cushionHint")}</p></div>
          {FIELDS.map((f) => <div key={f}><Label htmlFor={`pl-${f}`} className="text-xs">{t(`field.${f}`)}</Label><Input id={`pl-${f}`} type="number" inputMode="decimal" disabled={dis} value={draft[f] ?? ""} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} /><p className="mt-1 text-[11px] text-muted-foreground">{t(`fieldHint.${f}`)}</p></div>)}
        </div>
        <div className="mt-5">
          <p className="text-sm font-medium">{t("plan.standingTitle")}</p><p className="text-xs text-muted-foreground">{t("plan.standingHint")}</p>
          <div className="mt-2 space-y-2">
            {standing.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_8rem_5rem_auto] gap-2">
                <Input disabled={dis} value={s.title} placeholder={t("plan.standingName")} onChange={(e) => setStanding(standing.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label={t("plan.standingName")} />
                <Input disabled={dis} type="number" min="0" value={s.amount || ""} placeholder={t("amount")} onChange={(e) => setStanding(standing.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} aria-label={t("amount")} />
                <Input disabled={dis} type="number" min="1" max="31" value={s.dayOfMonth} onChange={(e) => setStanding(standing.map((x, j) => (j === i ? { ...x, dayOfMonth: Number(e.target.value) } : x)))} aria-label={t("plan.dayOfMonth")} />
                <Button disabled={dis} variant="ghost" size="icon" onClick={() => setStanding(standing.filter((_, j) => j !== i))} aria-label={t("remove")}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {canEdit && standing.length < 30 ? <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setStanding([...standing, { title: "", amount: 0, dayOfMonth: 1 }])}><Plus className="h-4 w-4" />{t("plan.addStanding")}</Button> : null}
          </div>
        </div>
        {canEdit ? (
          <div className="mt-5 flex gap-2">
            <Button onClick={() => void saveAssumptions()} disabled={busy === "assume"}>{busy === "assume" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t("save")}</Button>
            <Button variant="outline" onClick={() => void guard("reset", async () => { await api(`/api/cash-flow/assumptions?scenarioTag=${tag}`, { method: "DELETE" }); const fresh = await api<Record<Scenario, Assumptions>>("/api/cash-flow/assumptions"); setAssumptions(fresh); fill(fresh, tag); toast.success(t("resetDone")); })}>{t("resetDefaults")}</Button>
          </div>
        ) : <p className="mt-4 text-xs text-muted-foreground">{t("viewOnly")}</p>}
      </Section>

      <Section title={t("plan.adjustmentsTitle")} hint={t("plan.adjustmentsHint")}>
        {adjustments.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{t("plan.noAdjustments")}</p> : (
          <ul className="divide-y rounded-2xl border">
            {adjustments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0"><p className="truncate font-medium">{a.reason}</p><p className="text-xs text-muted-foreground">{dayLabel(a.date, locale)}{a.category ? ` · ${a.category}` : ""}</p></div>
                <div className="flex items-center gap-2"><span className={cn("font-medium tabular-nums", a.direction === "INFLOW" ? "text-emerald-600 dark:text-emerald-400" : "")}>{a.direction === "INFLOW" ? "+" : "−"}{money(Number(a.amount))}</span>
                  {canEdit ? <Button variant="ghost" size="icon" aria-label={t("remove")} onClick={() => void guard(`del-${a.id}`, async () => { await api(`/api/cash-flow/manual-adjustments/${a.id}`, { method: "DELETE" }); setAdjustments(await api("/api/cash-flow/manual-adjustments")); })}><Trash2 className="h-4 w-4" /></Button> : null}</div>
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-[9rem_8rem_9rem_1fr_auto]">
            <div><Input type="date" value={adj.date} onChange={(e) => setAdj({ ...adj, date: e.target.value })} aria-label={t("date")} aria-invalid={!!errors.date} />{errors.date ? <p className="mt-1 text-xs text-rose-600">{errors.date}</p> : null}</div>
            <Select value={adj.direction} onValueChange={(v) => setAdj({ ...adj, direction: v })}><SelectTrigger aria-label={t("direction")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="INFLOW">{t("moneyIn")}</SelectItem><SelectItem value="OUTFLOW">{t("moneyOut")}</SelectItem></SelectContent></Select>
            <div><Input type="number" inputMode="decimal" min="0" placeholder={t("amount")} value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} aria-label={t("amount")} aria-invalid={!!errors.amount} />{errors.amount ? <p className="mt-1 text-xs text-rose-600">{errors.amount}</p> : null}</div>
            <div className="col-span-2 lg:col-span-1"><Input placeholder={t("reason")} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} aria-label={t("reason")} aria-invalid={!!errors.reason} />{errors.reason ? <p className="mt-1 text-xs text-rose-600">{errors.reason}</p> : null}</div>
            <Button className="col-span-2 lg:col-span-1" disabled={busy === "adj"} onClick={() => void guard("adj", async () => { await api("/api/cash-flow/manual-adjustments", { method: "POST", body: JSON.stringify({ date: adj.date, amount: Number(adj.amount), direction: adj.direction, reason: adj.reason }) }); setAdj({ date: "", amount: "", direction: "OUTFLOW", reason: "", category: "" }); setAdjustments(await api("/api/cash-flow/manual-adjustments")); toast.success(t("saved")); })}><Plus className="mr-1.5 h-4 w-4" />{t("plan.addAdjustment")}</Button>
          </div>
        ) : null}
      </Section>

      <Section title={t("plan.alertsTitle")} hint={t("plan.alertsHint")}>
        <div className="space-y-3">
          {([["criticalEnabled", "plan.alertCritical"], ["warningEnabled", "plan.alertWarning"]] as const).map(([k, label]) => (
            <label key={k} className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm"><span>{t(label)}</span><Switch disabled={dis} checked={prefs[k]} onCheckedChange={(v) => void guard("prefs", async () => { await api("/api/cash-flow/alert-preferences", { method: "POST", body: JSON.stringify({ [k]: v }) }); setPrefs({ ...prefs, [k]: v }); })} /></label>
          ))}
        </div>
      </Section>
    </div>
  );
}

function AccountRowEditor({ a, locale, money, disabled, onSave }: { a: AccountRow; locale: string; money: (n: number) => string; disabled: boolean; onSave: (b: { openingBalance?: number; openingBalanceDate?: string }) => void }) {
  const t = useTranslations("CashFlow");
  const [open, setOpen] = useState(false);
  const [bal, setBal] = useState(String(Number(a.openingBalance)));
  const [date, setDate] = useState(dateInput(a.openingBalanceDate));
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0"><p className="truncate font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{t("plan.txCount", { count: a.transactionCount })}{a.lastTransactionAt ? ` · ${t("plan.lastTx", { date: dayLabel(a.lastTransactionAt, locale) })}` : ""}</p></div>
        <div className="flex items-center gap-3"><span className="font-semibold tabular-nums">{money(a.balance)}</span>{!disabled ? <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>{t("plan.editStart")}</Button> : null}</div>
      </div>
      {open ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[12rem_10rem_auto]">
          <div><Label className="text-xs" htmlFor={`ob-${a.id}`}>{t("plan.openingBalance")}</Label><Input id={`ob-${a.id}`} type="number" inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} /></div>
          <div><Label className="text-xs" htmlFor={`od-${a.id}`}>{t("plan.openingDate")}</Label><Input id={`od-${a.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <Button className="self-end" onClick={() => { onSave({ openingBalance: Number(bal) || 0, openingBalanceDate: new Date(date).toISOString() }); setOpen(false); }}>{t("save")}</Button>
        </div>
      ) : null}
    </li>
  );
}
