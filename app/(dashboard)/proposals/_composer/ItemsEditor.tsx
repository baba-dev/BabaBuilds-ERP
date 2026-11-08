"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Plus, Repeat, Search, Trash2, Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { blankItem, newKey, type CatalogService, type DraftItem } from "./composer-types";

type Props = {
  items: DraftItem[];
  catalog: CatalogService[];
  catalogLoading: boolean;
  format: (n: number) => string;
  onChange: (items: DraftItem[]) => void;
};

function Toggle({ pressed, onClick, icon: Icon, label, hint }: { pressed: boolean; onClick: () => void; icon: typeof Repeat; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={hint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}

export function ItemsEditor({ items, catalog, catalogLoading, format, onChange }: Props) {
  const t = useTranslations("ProposalsHub.composer.items");
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return catalog.filter((s) => !q || s.name.toLocaleLowerCase().includes(q)).slice(0, 8);
  }, [catalog, query]);

  const patch = (key: string, next: Partial<DraftItem>) => onChange(items.map((i) => (i.key === key ? { ...i, ...next } : i)));
  const remove = (key: string) => onChange(items.filter((i) => i.key !== key));
  const addService = (s: CatalogService) =>
    onChange([
      ...items.filter((i) => i.title.trim() || i.unitPrice),
      { key: newKey(), serviceTemplateId: s.id, title: s.name, description: s.description ?? "", quantity: "1", unitPrice: String(Number(s.defaultPrice) || ""), isOptional: false, isRecurring: false },
    ]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchCatalog")} aria-label={t("searchCatalog")} className="h-11 rounded-xl ps-9" />
        </div>
        {catalogLoading ? (
          <p className="text-sm text-muted-foreground">{t("loadingCatalog")}</p>
        ) : catalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("emptyCatalog")}{" "}
            <a href="/services" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              {t("emptyCatalogCta")}
            </a>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {matches.map((s) => (
              <button key={s.id} type="button" onClick={() => addService(s)} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:border-indigo-500/60 hover:bg-indigo-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Plus className="size-3.5 shrink-0 text-indigo-600" aria-hidden />
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{format(Number(s.defaultPrice) || 0)}</span>
              </button>
            ))}
            {matches.length === 0 && <p className="text-sm text-muted-foreground">{t("noMatches")}</p>}
          </div>
        )}
      </div>

      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {items.map((item, index) => {
            const qty = Number(item.quantity);
            const price = Number(item.unitPrice);
            const lineTotal = Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0;
            return (
              <motion.li
                key={item.key}
                layout={reduce ? false : "position"}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, height: 0 }}
                className="space-y-3 rounded-xl border border-border/70 bg-background p-3 sm:p-4"
              >
                <div className="grid gap-3 sm:grid-cols-[1fr_6rem_9rem]">
                  <div className="space-y-1">
                    <label htmlFor={`item-title-${item.key}`} className="text-xs font-medium text-muted-foreground">{t("title")}</label>
                    <Input id={`item-title-${item.key}`} value={item.title} maxLength={200} onChange={(e) => patch(item.key, { title: e.target.value })} placeholder={t("titlePlaceholder")} className="h-10" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`item-qty-${item.key}`} className="text-xs font-medium text-muted-foreground">{t("quantity")}</label>
                    <Input id={`item-qty-${item.key}`} inputMode="numeric" value={item.quantity} onChange={(e) => patch(item.key, { quantity: e.target.value.replace(/[^0-9]/g, "") })} className="h-10 tabular-nums" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`item-price-${item.key}`} className="text-xs font-medium text-muted-foreground">{t("unitPrice")}</label>
                    <Input id={`item-price-${item.key}`} inputMode="decimal" value={item.unitPrice} onChange={(e) => patch(item.key, { unitPrice: e.target.value.replace(/[^0-9.]/g, "") })} className="h-10 tabular-nums" />
                  </div>
                </div>
                {item.title.trim() && item.unitPrice === "" && (
                  <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
                    {t("priceRequired")}
                  </p>
                )}
                <Textarea value={item.description} maxLength={1000} rows={2} onChange={(e) => patch(item.key, { description: e.target.value })} placeholder={t("descriptionPlaceholder")} aria-label={t("description")} className="min-h-0 resize-none text-sm" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Toggle pressed={item.isOptional} onClick={() => patch(item.key, { isOptional: !item.isOptional })} icon={Paperclip} label={t("optional")} hint={t("optionalHint")} />
                    <Toggle pressed={item.isRecurring} onClick={() => patch(item.key, { isRecurring: !item.isRecurring })} icon={Repeat} label={t("recurring")} hint={t("recurringHint")} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{format(lineTotal)}</span>
                    <Button type="button" size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-rose-600" onClick={() => remove(item.key)} aria-label={t("remove", { n: index + 1 })}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <Button type="button" variant="outline" className="gap-1.5 rounded-xl" onClick={() => onChange([...items, blankItem()])}>
        <Plus className="size-4" aria-hidden /> {t("addCustom")}
      </Button>
    </div>
  );
}
