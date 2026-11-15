"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Package, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import { MovementsPanel } from "./_components/MovementsPanel";
import { OrdersPanel } from "./_components/OrdersPanel";
import { OverviewPanel } from "./_components/OverviewPanel";
import type { PoDraftLine } from "./_components/PoComposer";
import { ProductsPanel } from "./_components/ProductsPanel";
import { ReorderPanel } from "./_components/ReorderPanel";
import { api, type Insights } from "./_components/shared";

const TABS = ["overview", "products", "reorder", "orders", "movements"] as const;
type Tab = (typeof TABS)[number];
type InsightsResponse = Insights & { perms: { edit: boolean } };

function InventoryWorkspace() {
  const t = useTranslations("InventoryHub");
  const { fCurrency, locale } = useFormat();
  const router = useRouter();
  const sp = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(sp.get("tab") ?? "") ? (sp.get("tab") as Tab) : "overview";
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [compose, setCompose] = useState<PoDraftLine[] | null>(null);

  const money = useMemo(() => (n: number) => fCurrency(n), [fCurrency]);
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const num = useCallback((n: number) => nf.format(n), [nf]);
  const setTab = useCallback((k: string) => { const next = new URLSearchParams(sp.toString()); next.set("tab", k); router.replace(`/inventory?${next}`, { scroll: false }); }, [router, sp]);
  const reload = useCallback(() => { setLoading(true); setTick((n) => n + 1); }, []);

  useEffect(() => {
    let cancelled = false;
    api<InsightsResponse>("/api/inventory/insights")
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tick]);

  const canEdit = data?.perms.edit ?? false;
  const badge = (k: Tab) => (k === "reorder" && data ? data.reorder.filter((r) => r.urgency === "NOW").length : 0);

  return (
    <DashboardPageShell
      title={t("title")}
      description={t("subtitle")}
      icon={<Package className="h-6 w-6 text-primary" />}
      pageActions={<Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-1.5">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t("refresh")}</Button>}
    >
      <div className="space-y-5">
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label={t("title")}>
          {TABS.map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {t(`tab.${k}`)}{badge(k) > 0 ? <span className="ms-1.5 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{badge(k)}</span> : null}
            </button>
          ))}
        </nav>

        {error && !data ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8 text-center"><p className="font-medium">{t("loadFailed")}</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button className="mt-4" variant="outline" onClick={reload}>{t("retry")}</Button></div>
        ) : !data ? (
          <div className="space-y-4"><Skeleton className="h-52 rounded-3xl" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div></div>
        ) : (
          <div className={cn(loading && "opacity-70 transition-opacity")}>
            {tab === "overview" ? <OverviewPanel data={data} money={money} num={num} onTab={setTab} />
              : tab === "products" ? <ProductsPanel canEdit={canEdit} money={money} num={num} reloadKey={tick} onChanged={reload} />
              : tab === "reorder" ? <ReorderPanel data={data} money={money} num={num} canEdit={canEdit} onCreate={(lines) => { setCompose(lines); setTab("orders"); }} />
              : tab === "orders" ? <OrdersPanel canEdit={canEdit} money={money} locale={locale} reloadKey={tick} onChanged={reload} composeOpen={compose !== null} onComposeClose={() => setCompose(null)} prefill={compose ?? []} />
              : <MovementsPanel reloadKey={tick} locale={locale} />}
          </div>
        )}
      </div>
    </DashboardPageShell>
  );
}

export default function InventoryPage() {
  return <Suspense fallback={null}><InventoryWorkspace /></Suspense>;
}
