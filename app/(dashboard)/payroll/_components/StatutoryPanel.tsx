"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { StatutoryArt } from "./art/PayrollArt";
import { api, dayLabel, monthLabel, type Remittance, type RemittancesResponse } from "./shared";

const KINDS = ["PF", "ESI", "PT", "TDS"] as const;

export function StatutoryPanel({ data, locale, money, canPay, onChanged }: { data: RemittancesResponse; locale: string; money: (n: number) => string; canPay: boolean; onChanged: () => void }) {
  const t = useTranslations("PayrollHub");
  const [paying, setPaying] = useState<Remittance | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!paying) return;
    setBusy(true);
    try {
      await api(`/api/payroll/remittances/${paying.id}/pay`, { method: "POST", body: JSON.stringify({ reference }) });
      toast.success(t("statutory.paid"));
      setPaying(null); setReference(""); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("statutory.payFailed")); } finally { setBusy(false); }
  };

  const due = data.items.filter((i) => i.status === "DUE");
  const byKind = (k: string) => due.filter((i) => i.kind === k).reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-5">
      <section className="grid items-center gap-4 rounded-3xl border bg-gradient-to-br from-indigo-500/10 via-card to-emerald-500/10 p-5 sm:p-6 md:grid-cols-[1fr_220px]">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold"><Landmark className="h-5 w-5 text-indigo-500" />{t("statutory.title")}</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("statutory.body")}</p>
          <div className="mt-4 flex flex-wrap gap-6">
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("statutory.owed")}</p><p className="text-2xl font-semibold tabular-nums">{money(data.summary.dueAmount)}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("statutory.overdue")}</p><p className={cn("text-2xl font-semibold tabular-nums", data.summary.overdueCount > 0 && "text-rose-600")}>{data.summary.overdueCount}</p></div>
          </div>
        </div>
        <div className="hidden h-36 md:block"><StatutoryArt /></div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KINDS.map((k) => (
          <div key={k} className="rounded-2xl border bg-card p-4 shadow-xs">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`kind.${k}`)}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{money(byKind(k))}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t(`statutory.hint.${k}`)}</p>
          </div>
        ))}
      </div>

      <section className="rounded-3xl border bg-card p-5 shadow-xs">
        <h3 className="text-sm font-semibold">{t("statutory.list")}</h3>
        {data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center"><CheckCircle2 className="h-9 w-9 text-emerald-500" /><p className="text-sm text-muted-foreground">{t("statutory.empty")}</p></div>
        ) : (
          <div className="mt-3 divide-y">
            {data.items.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(`kind.${r.kind}`)} <span className="text-muted-foreground">· {monthLabel(r.period, locale)}</span></p>
                  <p className={cn("text-xs", r.overdue ? "font-medium text-rose-600" : "text-muted-foreground")}>{r.status === "PAID" ? t("statutory.paidOn", { date: dayLabel(r.paidAt, locale) }) + (r.reference ? ` · ${r.reference}` : "") : r.overdue ? t("overview.overdue", { date: dayLabel(r.dueDate, locale) }) : t("overview.dueOn", { date: dayLabel(r.dueDate, locale) })}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums">{money(r.amount)}</span>
                  {r.status === "PAID" ? <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">{t("statutory.statusPaid")}</span> : <Button size="sm" variant="outline" disabled={!canPay} onClick={() => { setPaying(r); setReference(""); }}>{t("statutory.markPaid")}</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={Boolean(paying)} onOpenChange={(v) => !v && setPaying(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("statutory.payTitle", { kind: paying ? t(`kind.${paying.kind}`) : "" })}</DialogTitle><DialogDescription>{t("statutory.payHint", { amount: paying ? money(paying.amount) : "" })}</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><label className="text-xs font-medium">{t("statutory.reference")}</label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("statutory.referencePlaceholder")} maxLength={80} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setPaying(null)}>{t("common.cancel")}</Button><Button onClick={() => void confirm()} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("statutory.confirm")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
