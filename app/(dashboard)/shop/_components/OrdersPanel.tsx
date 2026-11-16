"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { OrderDrawer } from "./OrderDrawer";
import { api, type Order, type OrdersResponse, STATUSES } from "./shared";
import { StatusPill } from "./StatusPill";

type Filter = "ALL" | "OPEN" | (typeof STATUSES)[number];
const FILTERS: Filter[] = ["ALL", "OPEN", "PAID", "SHIPPED", "FULFILLED", "PENDING", "REFUNDED", "FAILED"];

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => { const h = setTimeout(() => setD(v), ms); return () => clearTimeout(h); }, [v, ms]);
  return d;
}

export function OrdersPanel({ canManage, money, locale, reloadKey, counts, onChanged, initialFilter }: { canManage: boolean; money: (n: number, cur: string) => string; locale: string; reloadKey: number; counts: Record<string, number>; onChanged: () => void; initialFilter?: Filter }) {
  const t = useTranslations("ShopHub");
  const [filter, setFilter] = useState<Filter>(initialFilter ?? "ALL");
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const base = `/api/shop/orders?${new URLSearchParams({ status: filter, limit: "25", ...(dq ? { q: dq } : {}) })}`;
  const key = `${base}|${reloadKey}`;
  const [state, setState] = useState<{ key: string | null; items: Order[]; cursor: string | null; error: string | null }>({ key: null, items: [], cursor: null, error: null });
  const [moreBusy, setMoreBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const my = ++seq.current;
    api<OrdersResponse>(base)
      .then((d) => { if (!cancelled && my === seq.current) setState({ key, items: d.orders, cursor: d.nextCursor, error: null }); })
      .catch((e) => { if (!cancelled) setState((s) => ({ ...s, key, error: e instanceof Error ? e.message : "error" })); });
    return () => { cancelled = true; };
  }, [base, key]);

  const loadMore = useCallback(async () => {
    if (!state.cursor) return;
    setMoreBusy(true);
    try {
      const d = await api<OrdersResponse>(`${base}&cursor=${encodeURIComponent(state.cursor)}`);
      setState((s) => ({ ...s, items: [...s.items, ...d.orders], cursor: d.nextCursor }));
    } finally {
      setMoreBusy(false);
    }
  }, [state.cursor, base]);

  const loading = state.key !== key;
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const open = state.items.find((o) => o.id === openId) ?? null;
  const count = (f: Filter) => (f === "ALL" ? Object.values(counts).reduce((a, b) => a + b, 0) : f === "OPEN" ? (counts.PAID ?? 0) + (counts.REFUND_DUE ?? 0) : counts[f] ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1"><Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("orders.search")} className="ps-9" aria-label={t("orders.search")} /></div>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {FILTERS.map((f) => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn("shrink-0 rounded-full border px-3 py-1 text-xs transition-colors", filter === f ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{t(`filter.${f}`)}{count(f) > 0 ? <span className="ms-1.5 opacity-70">{count(f)}</span> : null}</button>)}
      </div>

      {state.error && state.items.length === 0 ? <p className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center text-sm">{state.error}</p>
        : loading && state.items.length === 0 ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        : state.items.length === 0 ? <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed p-10 text-center text-sm text-muted-foreground"><Inbox className="h-9 w-9 opacity-40" />{dq || filter !== "ALL" ? t("orders.noMatch") : t("orders.empty")}</div>
        : (
          <ul className={cn("divide-y overflow-hidden rounded-2xl border bg-card", loading && "opacity-60")}>
            {state.items.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => setOpenId(o.id)} className="flex w-full items-center gap-3 p-3 text-start hover:bg-muted/40" aria-label={t("orders.open", { name: o.buyerName })}>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{o.buyerName}</p><p className="truncate text-xs text-muted-foreground">{o.items.map((i) => `${i.productName} × ${i.quantity}`).join(", ")}</p></div>
                  <div className="text-end"><p className="text-sm font-semibold tabular-nums">{money(Number(o.amount), o.currency)}</p><p className="text-xs text-muted-foreground">{fmt.format(new Date(o.createdAt))}</p></div>
                  <StatusPill status={o.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      {state.cursor ? <div className="text-center"><Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={moreBusy}>{moreBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("loadMore")}</Button></div> : null}
      <OrderDrawer order={open} canManage={canManage} money={money} locale={locale} onClose={() => setOpenId(null)} onChanged={onChanged} />
    </div>
  );
}
