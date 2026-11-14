"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { api, money, shortDate, type ExpenseRow } from "./shared";

type Match = { id: string; date: string; description: string; amount: number; score: number; vendorInNarration: boolean };

/** Bank debits that could be the payment for this expense. Matching one marks a bill on credit as paid on the bank date. */
export function BankMatchDialog({ expense, currency, locale, onClose, onDone }: { expense: ExpenseRow | null; currency: string; locale: string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("ExpensesLedger.bank");
  const tl = useTranslations("ExpensesLedger");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!expense) return;
    let live = true;
    setMatches(null);
    api<{ data: Match[] }>(`/api/expenses/${expense.id}/bank-matches`).then((r) => { if (live) setMatches(r.ok ? r.data.data : []); });
    return () => { live = false; };
  }, [expense]);
  async function link(m: Match) {
    if (!expense) return;
    setBusy(m.id);
    const r = await api<{ markedPaid?: boolean }>(`/api/expenses/${expense.id}/bank-matches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bankTransactionId: m.id }) });
    setBusy(null);
    if (!r.ok) return toast.error(r.data.error ?? tl("toast.failed"));
    toast.success(r.data.markedPaid ? t("matchedPaid") : t("matched"));
    onDone(); onClose();
  }
  return (
    <ResponsiveDialog open={expense !== null} onOpenChange={(o) => !o && onClose()} title={t("title", { vendor: expense?.vendor ?? "" })} description={expense ? t("help", { amount: money(expense.amount, currency, locale) }) : ""}>
      <div className="space-y-2">
        {matches === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />{t("loading")}</p>
          : matches.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("none")}</p>
          : matches.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
              <div className="min-w-0"><p className="truncate font-medium">{m.description}</p><p className="text-xs text-muted-foreground">{shortDate(m.date, locale)} · {money(m.amount, currency, locale)}{m.vendorInNarration ? ` · ${t("nameMatch")}` : ""}</p></div>
              <Button size="sm" disabled={busy !== null} onClick={() => void link(m)}>{busy === m.id ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden /> : <Landmark className="mr-1.5 size-4" aria-hidden />}{t("match")}</Button>
            </div>))}
        {expense?.paymentStatus === "UNPAID" && <p className="text-xs text-muted-foreground">{t("paidNote")}</p>}
      </div>
    </ResponsiveDialog>
  );
}
