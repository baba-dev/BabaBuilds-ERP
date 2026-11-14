"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Mail, Pencil, Repeat, ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { PRESET_CATEGORIES } from "@/lib/expenses/categories";
import { api, money, shortDate, type ExpenseRow } from "./shared";

const SOURCE_ICON: Record<string, React.ReactNode> = { EMAIL: <Mail className="size-3" aria-hidden />, RECURRING: <Repeat className="size-3" aria-hidden />, SCAN: <ScanLine className="size-3" aria-hidden /> };

/** Entries that do not count yet: forwarded bills, recurring drafts, anything waiting for an approver, and rejected ones to fix. */
export function ReviewPanel({ currency, locale, canApprove, onEdit, onChanged }: { currency: string; locale: string; canApprove: boolean; onEdit: (e: ExpenseRow) => void; onChanged: () => void }) {
  const t = useTranslations("ExpensesLedger");
  const tc = useTranslations("Expenses");
  const [mode, setMode] = useState<"REVIEW" | "REJECTED">("REVIEW");
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<{ data: ExpenseRow[] }>(`/api/expenses?approval=${mode}&period=all&limit=100&sort=date&dir=desc`);
    if (r.ok) setRows(r.data.data); else toast.error(r.data.error ?? t("toast.failed"));
    setSelected(new Set()); setLoading(false);
  }, [mode, t]);
  useEffect(() => { void load(); }, [load]);

  async function act(action: "APPROVE" | "REJECT", ids: string[], why?: string) {
    setBusy(true);
    const r = await api<{ updated: number; skipped?: number }>("/api/expenses/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, action, reason: why }) });
    setBusy(false); setRejecting(null); setReason("");
    if (!r.ok) { toast.error(r.data.code === "INCOMPLETE" ? t("review.incomplete") : r.data.error ?? t("toast.failed")); return; }
    toast.success(action === "APPROVE" ? t("review.approved", { count: r.data.updated }) : t("review.rejectedToast", { count: r.data.updated }));
    if (r.data.skipped) toast.warning(t("review.skipped", { count: r.data.skipped }));
    void load(); onChanged();
  }
  const catLabel = (value: string) => { const p = PRESET_CATEGORIES.find((c) => c.value === value); return p ? tc(`cat_${p.key}` as never) : value; };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <section aria-label={t("tabs.review")} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="flex gap-1.5">
          {(["REVIEW", "REJECTED"] as const).map((m) => <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-full border px-3.5 py-1.5 text-sm ${mode === m ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted"}`}>{t(`review.mode.${m}` as never)}</button>)}
        </div>
        {canApprove && selected.size > 0 && mode === "REVIEW" && (
          <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void act("APPROVE", [...selected])}><Check className="mr-1.5 size-4" aria-hidden />{t("review.approve", { count: selected.size })}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting([...selected])}><X className="mr-1.5 size-4" aria-hidden />{t("review.reject")}</Button></div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{mode === "REVIEW" ? t("review.help") : t("review.helpRejected")}</p>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {loading ? <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          : rows.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">{mode === "REVIEW" ? t("review.empty") : t("review.emptyRejected")}</p>
          : <ul>{rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-0">
              {canApprove && mode === "REVIEW" && <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} aria-label={t("select", { name: e.vendor })} />}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5"><span className="truncate font-medium">{e.vendor}</span><Badge variant="outline" className="gap-1 text-[10px]">{SOURCE_ICON[e.source]}{t(`source.${e.source}` as never)}</Badge><Badge variant="outline" className={`text-[10px] ${e.approvalStatus === "DRAFT" ? "border-sky-500/40 text-sky-700 dark:text-sky-300" : e.approvalStatus === "REJECTED" ? "border-rose-500/40 text-rose-600" : "border-amber-500/40 text-amber-700 dark:text-amber-300"}`}>{t(`review.status.${e.approvalStatus}` as never)}</Badge></p>
                <p className="truncate text-xs text-muted-foreground">{shortDate(e.date, locale)} · {catLabel(e.category)}{e.description ? ` · ${e.description}` : ""}{e.approvalStatus === "REJECTED" && e.rejectionReason ? ` · ${t("review.reason", { reason: e.rejectionReason })}` : ""}</p>
              </div>
              <span className={`font-medium tabular-nums ${e.amount <= 0 ? "text-rose-600" : ""}`}>{e.amount > 0 ? money(e.amount, currency, locale) : t("review.noAmount")}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => onEdit(e)}><Pencil className="mr-1.5 size-3.5" aria-hidden />{t("review.complete")}</Button>
                {e.receiptUrl && <Button variant="ghost" size="sm" asChild><a href={e.receiptUrl} target="_blank" rel="noopener noreferrer">{tc("actions.view_receipt")}</a></Button>}
                {canApprove && mode === "REVIEW" && e.amount > 0 && <Button variant="ghost" size="icon" className="size-8 text-emerald-600" aria-label={`${t("review.approveOne")}: ${e.vendor}`} disabled={busy} onClick={() => void act("APPROVE", [e.id])}><Check className="size-4" aria-hidden /></Button>}
              </div>
            </li>))}</ul>}
      </div>
      <ResponsiveDialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)} title={t("review.rejectTitle", { count: rejecting?.length ?? 0 })} description={t("review.rejectHelp")}>
        <div className="space-y-4"><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t("review.reasonHint")} aria-label={t("review.reasonLabel")} />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setRejecting(null)}>{t("cancel")}</Button><Button className="bg-rose-600 text-white hover:bg-rose-700" disabled={busy} onClick={() => rejecting && void act("REJECT", rejecting, reason)}>{busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}{t("review.reject")}</Button></div></div>
      </ResponsiveDialog>
    </section>
  );
}
