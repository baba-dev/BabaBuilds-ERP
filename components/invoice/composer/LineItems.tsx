"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Check, Loader2, Minus, Package, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type ComposerItem = {
  id: string;
  title: string;
  nicDetails: string;
  amount: string;
  quantity: number;
  defaultPrice: number;
  selected: boolean;
  isProduct: boolean;
  currentStock: number;
};

type Props = {
  items: ComposerItem[];
  loading: boolean;
  currencySymbol: string;
  format: (n: number) => string;
  onToggle: (index: number) => void;
  onAmount: (index: number, value: string) => void;
  onQuantity: (index: number, qty: string) => void;
};

type Tab = "all" | "services" | "products";

export function LineItems({ items, loading, currencySymbol, format, onToggle, onAmount, onQuantity }: Props) {
  const t = useTranslations("InvoiceComposer.items");
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const hasProducts = items.some((i) => i.isProduct);

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => (tab === "all" ? true : tab === "products" ? item.isProduct : !item.isProduct))
      .filter(({ item }) => !q || item.title.toLocaleLowerCase().includes(q) || item.nicDetails.toLocaleLowerCase().includes(q));
  }, [items, query, tab]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {t("loading")}
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
        <Package className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
        <p className="font-semibold">{t("emptyTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("emptyDescription")}</p>
        <a href="/services" className="mt-3 inline-block text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
          {t("emptyCta")}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-11 rounded-xl ps-9" />
        </div>
        {hasProducts && (
          <div className="inline-flex rounded-xl bg-muted p-1" role="tablist" aria-label={t("filter")}>
            {(["all", "services", "products"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {t(`tabs.${value}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t("noMatches")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ item, index }) => {
            const outOfStock = item.isProduct && item.currentStock === 0;
            const lineTotal = Number(item.amount) || 0;
            return (
              <li key={item.id}>
                <motion.div
                  layout={reduce ? false : "position"}
                  className={cn(
                    "overflow-hidden rounded-xl border transition-colors",
                    item.selected ? "border-indigo-500/60 bg-indigo-500/[0.04] shadow-sm" : "border-border/70 bg-background hover:border-indigo-500/30",
                    outOfStock && "opacity-60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onToggle(index)}
                    disabled={outOfStock}
                    aria-pressed={item.selected}
                    className="flex w-full items-center gap-3 p-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
                  >
                    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors", item.selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-border")} aria-hidden>
                      <AnimatePresence>
                        {item.selected && (
                          <motion.span initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}>
                            <Check className="size-3.5" />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold">{item.title}</span>
                        {item.isProduct && (
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", item.currentStock > 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300")}>
                            {item.currentStock > 0 ? t("inStock", { count: item.currentStock }) : t("outOfStock")}
                          </span>
                        )}
                      </span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">{item.nicDetails}</span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{item.defaultPrice > 0 ? format(item.defaultPrice) : ""}</span>
                  </button>

                  <AnimatePresence initial={false}>
                    {item.selected && (
                      <motion.div
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={reduce ? undefined : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
                      >
                        <div className="flex flex-wrap items-end gap-3 border-t border-indigo-500/20 px-3 pb-3 pt-3 sm:px-4">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground" htmlFor={`qty-${item.id}`}>{t("quantity")}</label>
                            <div className="flex items-center rounded-lg border border-border bg-background">
                              <button type="button" onClick={() => onQuantity(index, String(Math.max(1, item.quantity - 1)))} disabled={item.quantity <= 1} aria-label={t("decrease")} className="p-2.5 text-muted-foreground hover:text-foreground disabled:opacity-40">
                                <Minus className="size-4" aria-hidden />
                              </button>
                              <input id={`qty-${item.id}`} type="number" inputMode="numeric" min={1} max={item.isProduct ? item.currentStock : undefined} value={item.quantity} onChange={(e) => onQuantity(index, e.target.value)} className="w-12 bg-transparent text-center text-sm font-semibold tabular-nums outline-none" />
                              <button type="button" onClick={() => onQuantity(index, String(item.quantity + 1))} disabled={item.isProduct && item.quantity >= item.currentStock} aria-label={t("increase")} className="p-2.5 text-muted-foreground hover:text-foreground disabled:opacity-40">
                                <Plus className="size-4" aria-hidden />
                              </button>
                            </div>
                          </div>
                          <div className="min-w-[8rem] flex-1 space-y-1">
                            <label className="text-xs font-medium text-muted-foreground" htmlFor={`amt-${item.id}`}>{t("amount")}</label>
                            <div className="relative">
                              <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol}</span>
                              <input id={`amt-${item.id}`} type="number" inputMode="decimal" step="0.01" min="0" required value={item.amount} onChange={(e) => onAmount(index, e.target.value)} placeholder="0.00" className="h-10 w-full rounded-lg border border-border bg-background ps-8 pe-3 text-sm font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                            </div>
                          </div>
                          <p className="ms-auto pb-2 text-sm font-semibold tabular-nums">{format(lineTotal)}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
