"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";

export type BillableExpense = { id: string; date: string; vendor: string; category: string; title: string; amount: number; markupPercent: number | null };

/** Expenses marked billable to this client and not yet invoiced. Adding one drops it into the invoice as a line; it is marked billed when the invoice is created. */
export function BillableExpensesPanel({ clientId, addedIds, currency, onAdd }: { clientId: string; addedIds: string[]; currency: string; onAdd: (items: BillableExpense[]) => void }) {
  const t = useTranslations("ExpensesLedger.billable");
  const [items, setItems] = useState<BillableExpense[]>([]);
  useEffect(() => {
    let live = true;
    if (!clientId) { setItems([]); return; }
    fetch(`/api/expenses/billable?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: [] })).then((d) => { if (live) setItems(Array.isArray(d.data) ? d.data : []); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [clientId]);
  const open = items.filter((i) => !addedIds.includes(i.id));
  if (items.length === 0) return null;
  const fmt = (n: number) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); } catch { return `${currency} ${n.toFixed(2)}`; } };
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 p-3" role="region" aria-label={t("title")}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium"><Receipt className="size-4 text-muted-foreground" aria-hidden />{t("title", { count: items.length })}</p>
        {open.length > 0 && <Button type="button" size="sm" variant="outline" onClick={() => onAdd(open)}><Plus className="mr-1 size-4" aria-hidden />{t("addAll", { count: open.length })}</Button>}
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((i) => {
          const added = addedIds.includes(i.id);
          return (
            <li key={i.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{i.title}{i.markupPercent ? <span className="text-xs text-muted-foreground"> · {t("markup", { pct: i.markupPercent })}</span> : null}</span>
              <span className="flex items-center gap-2"><span className="tabular-nums">{fmt(i.amount)}</span>{added ? <span className="text-xs text-emerald-600">{t("added")}</span> : <Button type="button" size="sm" variant="ghost" onClick={() => onAdd([i])}>{t("add")}</Button>}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
