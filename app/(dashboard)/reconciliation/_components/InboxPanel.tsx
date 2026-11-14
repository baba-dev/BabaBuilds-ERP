"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowUpRight, Check, EyeOff, FilePlus2, Loader2, RotateCcw, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { PRESET_CATEGORIES } from "@/lib/expenses/categories";
import { cn } from "@/lib/utils";
import { api, money, shortDate, type Suggestion } from "./shared";

type View = "waiting" | "ignored";
const select = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Everything still waiting for a decision. Lives on the server, so leaving the page loses nothing. */
export function InboxPanel({ accountId, view, locale, canCommit, focusId, onChanged }: { accountId: string; view: View; locale: string; canCommit: boolean; focusId: string | null; onChanged: () => void }) {
  const t = useTranslations("BankWorkspace");
  const tx = useTranslations("Expenses");
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [suggestMin, setSuggestMin] = useState(70);
  const [loading, setLoading] = useState(true);
  const [dir, setDir] = useState<"" | "credit" | "debit">("");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [expenseFor, setExpenseFor] = useState<Suggestion | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<Suggestion | null>(null);
  const reqId = useRef(0);
  const PAGE = 20;

  useEffect(() => { const h = setTimeout(() => { setDq(q); setPage(0); }, 250); return () => clearTimeout(h); }, [q]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    const p = new URLSearchParams({ view, limit: String(PAGE), offset: String(page * PAGE) });
    if (accountId) p.set("accountId", accountId);
    if (dir) p.set("direction", dir);
    if (dq) p.set("q", dq);
    const r = await api<{ data: Suggestion[]; total: number; settings?: { autoMatchSuggestionMin: number } }>(`/api/reconcile/queue?${p}`);
    if (id !== reqId.current) return;
    if (r.ok) { setRows(r.data.data); setTotal(r.data.total); if (r.data.settings) setSuggestMin(r.data.settings.autoMatchSuggestionMin); } else toast.error(r.data.error ?? t("failed"));
    setSelected(new Set()); setLoading(false);
  }, [accountId, view, dir, dq, page, t]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (focusId && rows.some((r) => r.id === focusId)) document.getElementById(`line-${focusId}`)?.scrollIntoView({ block: "center" }); }, [focusId, rows]);

  async function commit(payload: { approvedInvoices?: unknown[]; approvedExpenses?: unknown[] }, key: string) {
    setBusy(key);
    const r = await api<{ message?: string }>("/api/reconcile/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approvedInvoices: [], approvedExpenses: [], ...payload }) });
    setBusy(null);
    const skipped = r.data.skipped ?? [];
    if (!r.ok) { toast.error(skipped[0]?.message ?? r.data.error ?? t("failed")); return false; }
    toast.success(t("matchedToast"));
    if (skipped.length) toast.warning(t("skippedToast", { count: skipped.length, reason: skipped[0].message }));
    void load(); onChanged();
    return true;
  }
  const matchInvoice = (s: Suggestion, invoiceNumber: string) => commit({ approvedInvoices: [{ bankTransactionId: s.id, matchId: invoiceNumber }] }, s.id);
  const linkExpense = (s: Suggestion, expenseId: string) => commit({ approvedExpenses: [{ bankTransactionId: s.id, linkToExpenseId: expenseId }] }, s.id);
  async function matchReady() {
    const ready = rows.filter((r) => r.ready);
    await commit({
      approvedInvoices: ready.filter((r) => r.type === "CREDIT").map((r) => ({ bankTransactionId: r.id, matchId: r.invoices[0].invoiceNumber })),
      approvedExpenses: ready.filter((r) => r.type === "DEBIT").map((r) => ({ bankTransactionId: r.id, linkToExpenseId: r.expenses[0].expenseId })),
    }, "ready");
  }
  async function ignore(ids: string[], ignored: boolean) {
    setBusy(ids[0]);
    const r = await api("/api/reconcile/ignore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, ignored }) });
    setBusy(null);
    if (!r.ok) return toast.error(r.data.error ?? t("failed"));
    toast.success(ignored ? t("ignoredToast", { count: ids.length }) : t("restoredToast", { count: ids.length }));
    void load(); onChanged();
  }
  const readyCount = rows.filter((r) => r.ready).length;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <section className="space-y-3" aria-label={view === "ignored" ? t("tabs.ignored") : t("tabs.inbox")}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("search")} className="h-11 ps-9" />
        </div>
        <div role="tablist" aria-label={t("direction.label")} className="flex gap-1.5">
          {(["", "credit", "debit"] as const).map((d) => <button key={d || "all"} role="tab" aria-selected={dir === d} onClick={() => { setDir(d); setPage(0); }} className={cn("rounded-full border px-3.5 py-1.5 text-sm", dir === d ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted")}>{t(`direction.${d || "all"}` as never)}</button>)}
        </div>
      </div>

      {canCommit && view === "waiting" && (readyCount > 0 || selected.size > 0) && (
        <div role="region" aria-label={t("bulk.bar")} className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border bg-background/95 p-2.5 shadow-lg backdrop-blur">
          {readyCount > 0 && <Button size="sm" disabled={busy !== null} onClick={() => void matchReady()}>{busy === "ready" ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden /> : <Sparkles className="mr-1.5 size-4" aria-hidden />}{t("bulk.matchReady", { count: readyCount })}</Button>}
          {selected.size > 0 && <><span className="px-1 text-sm font-medium">{t("bulk.selected", { count: selected.size })}</span><Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void ignore([...selected], true)}><EyeOff className="mr-1.5 size-4" aria-hidden />{t("ignore")}</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t("bulk.clear")}</Button></>}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border bg-card">
        {loading && rows.length === 0 ? <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          : rows.length === 0 ? <p className="p-12 text-center text-sm text-muted-foreground">{view === "ignored" ? t("emptyIgnored") : q || dir ? t("noResults") : t("emptyInbox")}</p>
          : <ul>{rows.map((s) => {
            const credit = s.type === "CREDIT";
            const best = credit ? s.invoices[0] : s.expenses[0];
            // A weak guess is shown as a hint only: one click must not apply a 15% match to someone's books.
            const top = best && best.score >= suggestMin ? best : undefined;
            return (
              <li key={s.id} id={`line-${s.id}`} className={cn("grid gap-x-4 gap-y-3 border-b px-4 py-4 last:border-0 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]", focusId === s.id && "bg-indigo-500/5", selected.has(s.id) && "bg-indigo-500/5")}>
                <div className="flex min-w-0 gap-3">
                  {canCommit && view === "waiting" && <Checkbox className="mt-1" checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} aria-label={t("select", { name: s.description })} />}
                  <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full", credit ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600")}>{credit ? <ArrowDownLeft className="size-4" aria-hidden /> : <ArrowUpRight className="size-4" aria-hidden />}</span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 break-words text-sm font-medium">{s.description}</p>
                    <p className="text-xs text-muted-foreground">{shortDate(s.date, locale)}{s.accountName ? ` · ${s.accountName}` : ""}{s.reference ? ` · ${s.reference}` : ""}</p>
                    <p className={cn("mt-1 text-base font-semibold tabular-nums", credit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>{credit ? "+" : "−"}{money(s.amount, s.currency, locale)}</p>
                  </div>
                </div>
                <div className="min-w-0 space-y-2">
                  {view === "waiting" && top ? (
                    <div className="rounded-xl border bg-muted/30 p-2.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate font-medium">{credit ? `${s.invoices[0].invoiceNumber} · ${s.invoices[0].clientName}` : `${s.expenses[0].vendor}${s.expenses[0].unpaid ? ` · ${t("unpaidBill")}` : ""}`}</span>
                        <Badge variant="outline" className={cn("shrink-0 text-[10px]", s.ready ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "")}>{s.ready ? t("ready") : t("confidence", { score: Math.round(top.score) })}</Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{(top.reasons ?? []).slice(0, 3).map((x) => (t.has(`reasons.${x}` as never) ? t(`reasons.${x}` as never) : x.replaceAll("_", " "))).join(" · ")}{credit ? ` · ${t("outstanding", { amount: money(s.invoices[0].outstanding, s.invoices[0].currency, locale) })}` : ""}</p>
                      {canCommit && <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button size="sm" disabled={busy !== null} onClick={() => void (credit ? matchInvoice(s, s.invoices[0].invoiceNumber) : linkExpense(s, s.expenses[0].expenseId))}>{busy === s.id ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden /> : <Check className="mr-1.5 size-4" aria-hidden />}{t("match")}</Button>
                        {credit && s.invoices.slice(1).map((i) => <Button key={i.invoiceNumber} size="sm" variant="outline" disabled={busy !== null} onClick={() => void matchInvoice(s, i.invoiceNumber)}>{i.invoiceNumber}</Button>)}
                      </div>}
                    </div>
                  ) : view === "waiting" ? <p className="text-sm text-muted-foreground">{best ? t("weakGuess", { name: credit ? s.invoices[0].invoiceNumber : s.expenses[0].vendor, score: Math.round(best.score) }) : credit ? t("noInvoiceSuggestion") : t("noExpenseSuggestion")}{s.pos[0] ? ` ${t("poHint", { po: s.pos[0].poNumber, supplier: s.pos[0].supplier })}` : ""}</p> : null}
                  {canCommit && (
                    <div className="flex flex-wrap gap-1.5">
                      {view === "waiting" ? (<>
                        {credit ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setInvoiceFor(s)}>{t("chooseInvoice")}</Button>
                          : <><Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setExpenseFor(s)}><FilePlus2 className="mr-1.5 size-4" aria-hidden />{t("createExpense")}</Button></>}
                        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void ignore([s.id], true)}><EyeOff className="mr-1.5 size-4" aria-hidden />{t("ignore")}</Button>
                      </>) : <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void ignore([s.id], false)}><RotateCcw className="mr-1.5 size-4" aria-hidden />{t("restore")}</Button>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}</ul>}
      </div>
      {pages > 1 && <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{t("pageOf", { page: page + 1, total: pages, count: total })}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>{t("prev")}</Button><Button variant="outline" size="sm" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)}>{t("next")}</Button></div></div>}

      <CreateExpenseDialog line={expenseFor} locale={locale} catLabel={(v) => { const p = PRESET_CATEGORIES.find((c) => c.value === v); return p ? tx(`cat_${p.key}` as never) : v; }} onClose={() => setExpenseFor(null)} onSave={async (vendor, category) => { if (!expenseFor) return; const ok = await commit({ approvedExpenses: [{ bankTransactionId: expenseFor.id, aiVendor: vendor, aiCategory: category }] }, expenseFor.id); if (ok) setExpenseFor(null); }} busy={busy !== null} />
      <ChooseInvoiceDialog line={invoiceFor} locale={locale} onClose={() => setInvoiceFor(null)} onPick={async (n) => { if (!invoiceFor) return; const ok = await matchInvoice(invoiceFor, n); if (ok) setInvoiceFor(null); }} busy={busy !== null} />
    </section>
  );
}

function guessVendor(description: string) {
  const cleaned = description.replace(/\b(UPI|NEFT|IMPS|RTGS|POS|ACH|ECS|ATM|CR|DR)\b/gi, " ").replace(/[0-9@/\\_-]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.split(" ").slice(0, 3).join(" ").slice(0, 60);
}

function CreateExpenseDialog({ line, locale, catLabel, onClose, onSave, busy }: { line: Suggestion | null; locale: string; catLabel: (v: string) => string; onClose: () => void; onSave: (vendor: string, category: string) => void | Promise<void>; busy: boolean }) {
  const t = useTranslations("BankWorkspace");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("Other");
  useEffect(() => { if (line) { setVendor(guessVendor(line.description)); setCategory(line.category && PRESET_CATEGORIES.some((c) => c.value === line.category) ? line.category : "Other"); } }, [line]);
  return (
    <ResponsiveDialog open={line !== null} onOpenChange={(o) => !o && onClose()} title={t("createExpense")} description={line ? t("createExpenseHelp", { amount: money(line.amount, line.currency, locale), date: shortDate(line.date, locale) }) : ""}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void onSave(vendor.trim(), category); }}>
        <div><Label htmlFor="ce-vendor" className="mb-1.5 block text-xs text-muted-foreground">{t("vendor")}</Label><Input id="ce-vendor" className="h-10" value={vendor} maxLength={120} onChange={(e) => setVendor(e.target.value)} autoFocus /></div>
        <div><Label htmlFor="ce-cat" className="mb-1.5 block text-xs text-muted-foreground">{t("category")}</Label><select id="ce-cat" className={select} value={category} onChange={(e) => setCategory(e.target.value)}>{PRESET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{catLabel(c.value)}</option>)}</select></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t("cancel")}</Button><Button type="submit" disabled={busy || !vendor.trim()}>{busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}{t("saveExpense")}</Button></div>
      </form>
    </ResponsiveDialog>
  );
}

function ChooseInvoiceDialog({ line, locale, onClose, onPick, busy }: { line: Suggestion | null; locale: string; onClose: () => void; onPick: (invoiceNumber: string) => void | Promise<void>; busy: boolean }) {
  const t = useTranslations("BankWorkspace");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Array<{ id: string; invoiceNumber: string; clientName: string; outstanding?: number; amount?: number; currency?: string; balance?: number }>>([]);
  useEffect(() => { if (!line) return; setQ(""); }, [line]);
  useEffect(() => {
    if (!line) return;
    let live = true;
    const h = setTimeout(() => { api<{ data: typeof rows }>(`/api/reconcile/open-invoices?q=${encodeURIComponent(q)}&limit=15`).then((r) => { if (live && r.ok) setRows(r.data.data ?? []); }); }, 200);
    return () => { live = false; clearTimeout(h); };
  }, [line, q]);
  return (
    <ResponsiveDialog open={line !== null} onOpenChange={(o) => !o && onClose()} title={t("chooseInvoice")} description={line ? t("chooseInvoiceHelp", { amount: money(line.amount, line.currency, locale) }) : ""}>
      <div className="space-y-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("invoiceSearch")} aria-label={t("invoiceSearch")} className="h-10" autoFocus />
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {rows.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">{t("noOpenInvoices")}</li>}
          {rows.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 rounded-xl border p-2.5 text-sm"><span className="min-w-0 truncate"><span className="font-medium">{i.invoiceNumber}</span> · {i.clientName}{typeof i.outstanding === "number" ? <span className="text-xs text-muted-foreground"> · {t("outstanding", { amount: money(i.outstanding, line?.currency ?? "INR", locale) })}</span> : null}</span><Button size="sm" disabled={busy} onClick={() => void onPick(i.invoiceNumber)}>{t("match")}</Button></li>
          ))}
        </ul>
      </div>
    </ResponsiveDialog>
  );
}
