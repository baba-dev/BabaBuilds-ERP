"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, Receipt, RefreshCw, ShoppingBag, Store, Wallet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import { CatalogPanel } from "./CatalogPanel";
import { OrdersPanel } from "./OrdersPanel";
import { api, type OrdersResponse, type ShopSettings } from "./shared";
import { StorefrontPanel } from "./StorefrontPanel";

type Abilities = { canViewOrders: boolean; canManageOrders: boolean; canManageContent: boolean; canManageSettings: boolean };
const TABS = ["orders", "catalog", "storefront"] as const;
type Tab = (typeof TABS)[number];

function Kpi({ icon: Icon, label, value, sub, tone, onClick }: { icon: typeof Wallet; label: string; value: string; sub?: string; tone?: "warn"; onClick?: () => void }) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={cn("h-4 w-4", tone === "warn" && "text-amber-500")} />{label}</div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </>
  );
  return onClick ? <button type="button" onClick={onClick} className="rounded-2xl border bg-card p-4 text-start transition-colors hover:bg-muted/40">{body}</button> : <div className="rounded-2xl border bg-card p-4">{body}</div>;
}

function Workspace({ abilities }: { abilities: Abilities }) {
  const t = useTranslations("ShopHub");
  const { fCurrency, locale } = useFormat();
  const router = useRouter();
  const sp = useSearchParams();
  const visible = TABS.filter((k) => k !== "orders" || abilities.canViewOrders);
  const requested = sp.get("tab") as Tab | null;
  const tab: Tab = requested && visible.includes(requested) ? requested : visible[0]!;
  const [orders, setOrders] = useState<OrdersResponse["overview"] | null>(null);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [openFilter, setOpenFilter] = useState<"OPEN" | undefined>(undefined);

  const money = useMemo(() => (n: number, cur?: string) => (cur ? new Intl.NumberFormat(locale, { style: "currency", currency: cur }).format(n) : fCurrency(n)), [fCurrency, locale]);
  const setTab = useCallback((k: Tab) => { const next = new URLSearchParams(sp.toString()); next.set("tab", k); router.replace(`/shop?${next}`, { scroll: false }); }, [router, sp]);
  const reload = useCallback(() => { setLoading(true); setTick((n) => n + 1); }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([abilities.canViewOrders ? api<OrdersResponse>("/api/shop/orders?limit=1") : Promise.resolve(null), api<ShopSettings>("/api/shop/settings")]).then(([o, s]) => {
      if (cancelled) return;
      if (s.status === "rejected") setError(s.reason instanceof Error ? s.reason.message : "error"); else { setSettings(s.value); setError(null); }
      if (o.status === "fulfilled" && o.value) setOrders(o.value.overview);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tick, abilities.canViewOrders]);

  const url = settings?.shopSlug ? `/shop/${settings.shopSlug}` : null;
  return (
    <DashboardPageShell
      title={t("title")}
      description={t("subtitle")}
      icon={<Store className="h-6 w-6 text-primary" />}
      pageActions={
        <div className="flex items-center gap-2">
          {url && settings?.shopEnabled ? <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{t("viewShop")}</a></Button> : null}
          <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-1.5">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t("refresh")}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        {abilities.canViewOrders ? (
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {orders ? (
              <>
                <Kpi icon={Wallet} label={t("kpi.revenue")} value={money(orders.revenue)} sub={t("kpi.revenueSub")} />
                <Kpi icon={ShoppingBag} label={t("kpi.orders")} value={String(orders.total)} sub={t("kpi.ordersSub", { paid: (orders.counts.PAID ?? 0) + (orders.counts.SHIPPED ?? 0) + (orders.counts.FULFILLED ?? 0) })} />
                <Kpi icon={AlertTriangle} tone={orders.needsAction ? "warn" : undefined} label={t("kpi.action")} value={String(orders.needsAction)} sub={t("kpi.actionSub")} onClick={orders.needsAction ? () => { setOpenFilter("OPEN"); setTab("orders"); } : undefined} />
                <Kpi icon={Receipt} label={t("kpi.tax")} value={money(orders.tax)} sub={t("kpi.taxSub")} />
              </>
            ) : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </section>
        ) : null}

        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label={t("title")}>
          {visible.map((k) => <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)} className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{t(`tab.${k}`)}{k === "orders" && orders && orders.needsAction > 0 ? <span className="ms-1.5 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{orders.needsAction}</span> : null}</button>)}
        </nav>

        {error && !settings ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8 text-center"><p className="font-medium">{t("loadFailed")}</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button className="mt-4" variant="outline" onClick={reload}>{t("retry")}</Button></div>
          : !settings ? <Skeleton className="h-72 rounded-3xl" />
          : tab === "orders" ? <OrdersPanel canManage={abilities.canManageOrders} money={money} locale={locale} reloadKey={tick} counts={orders?.counts ?? {}} onChanged={reload} initialFilter={openFilter} />
          : tab === "catalog" ? <CatalogPanel canManage={abilities.canManageContent || abilities.canManageSettings} money={(n) => money(n)} reloadKey={tick} onChanged={reload} />
          : <StorefrontPanel key={tick} settings={settings} abilities={abilities} onChanged={reload} />}
      </div>
    </DashboardPageShell>
  );
}

export function ShopWorkspace({ abilities }: { abilities: Abilities }) {
  return <Suspense fallback={null}><Workspace abilities={abilities} /></Suspense>;
}
