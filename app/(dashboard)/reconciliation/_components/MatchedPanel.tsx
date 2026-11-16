"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowUpRight, Loader2, Search, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { api, money, shortDate, type MatchedRow } from "./shared";

/** Lines already matched. A wrong match can be undone: invoice receipts are returned, an expense created by the match is removed. */
export function MatchedPanel({ accountId, locale, currency, canCommit, onChanged }: { accountId: string; locale: string; currency: string; canCommit: boolean; onChanged: () => void }) {
  const t = useTranslations("BankWorkspace");
  const [rows, setRows] = useState<MatchedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [page, setPage] = useState(0);
  const [undo, setUndo] = useState<MatchedRow | null>(null);
  const [busy, setBusy] = useState(false);
  const PAGE = 20;
  useEffect(() => { const h = setTimeout(() => { setDq(q); setPage(0); }, 250); return () => clearTimeout(h); }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ reconciled: "1", limit: String(PAGE), offset: String(page * PAGE) });
    if (accountId) p.set("accountId", accountId);
    if (dq) p.set("q", dq);
    const r = await api<{ data: MatchedRow[]; total: number }>(`/api/reconcile/transactions?${p}`);
    if (r.ok) { setRows(r.data.data); setTotal(r.data.total); } else toast.error(r.data.error ?? t("failed"));
    setLoading(false);
  }, [accountId, dq, page, t]);
  useEffect(() => { void load(); }, [load]);

  async function doUndo() {
    if (!undo) return;
    setBusy(true);
    const r = await api("/api/reconcile/unmatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bankTransactionId: undo.id }) });
    setBusy(false); setUndo(null);
    if (!r.ok) return toast.error(r.data.error ?? t("failed"));
    toast.success(t("undoneToast")); void load(); onChanged();
  }
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <section className="space-y-3" aria-label={t("tabs.matched")}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("search")} className="h-11 ps-9" />
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {loading && rows.length === 0 ? <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          : rows.length === 0 ? <p className="p-12 text-center text-sm text-muted-foreground">{t("emptyMatched")}</p>
          : <ul>{rows.map((r) => {
            const n = Number(r.amount); const credit = n > 0;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-0">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", credit ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600")}>{credit ? <ArrowDownLeft className="size-4" aria-hidden /> : <ArrowUpRight className="size-4" aria-hidden />}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.description}</p><p className="text-xs text-muted-foreground">{shortDate(r.date, locale)}{r.accountName ? ` · ${r.accountName}` : ""}</p></div>
                <Badge variant="outline" className="text-[11px]">{r.matchedInvoiceId ? t("matchedInvoice") : r.matchedExpenseId ? t("matchedExpense") : t("matchedOther")}</Badge>
                <span className="font-medium tabular-nums">{credit ? "+" : "−"}{money(Math.abs(n), currency, locale)}</span>
                {canCommit && <Button size="sm" variant="ghost" onClick={() => setUndo(r)}><Undo2 className="mr-1.5 size-4" aria-hidden />{t("undo")}</Button>}
              </li>
            );
          })}</ul>}
      </div>
      {pages > 1 && <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{t("pageOf", { page: page + 1, total: pages, count: total })}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>{t("prev")}</Button><Button variant="outline" size="sm" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)}>{t("next")}</Button></div></div>}
      <AlertDialog open={undo !== null} onOpenChange={(o) => !o && setUndo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("undoTitle")}</AlertDialogTitle><AlertDialogDescription>{t("undoBody")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("cancel")}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => void doUndo()}>{busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}{t("undo")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
