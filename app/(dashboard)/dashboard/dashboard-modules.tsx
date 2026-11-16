"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, Boxes, FileText, Loader2, ShieldCheck, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ROUTES } from "./dashboard-routes";
import { formatRelative } from "./dashboard-format";
import { Delta, EmptyNote, Panel, PanelLink, focusRing, toneChipClass, type Tone } from "./dashboard-ui";
import type { DashboardData } from "./types";

type Money = (value: number) => string;

function MiniStat({ label, value, href, extra, tone }: { label: string; value: ReactNode; href?: string; extra?: ReactNode; tone?: Tone }) {
  const body = (
    <>
      <span className="block text-[11px] leading-tight text-muted-foreground [overflow-wrap:anywhere]">{label}</span>
      <span className="mt-0.5 flex items-center gap-1.5">
        <span className={cn("truncate text-lg font-semibold tabular-nums tracking-tight text-foreground", tone === "critical" && "text-rose-600 dark:text-rose-400", tone === "warning" && "text-amber-600 dark:text-amber-400")}>{value}</span>
        {extra}
      </span>
    </>
  );
  const className = "block min-w-0 rounded-xl bg-muted/50 px-2.5 py-2.5";
  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:bg-muted", focusRing)}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function CalloutLink({ href, children, tone = "info" }: { href: string; children: ReactNode; tone?: Tone }) {
  return (
    <Link href={href} className={cn("group flex min-h-10 items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-opacity hover:opacity-85", toneChipClass[tone], focusRing)}>
      <span className="min-w-0 truncate">{children}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
    </Link>
  );
}

function SalesCard({ sales, pipelineEnabled }: { sales: DashboardData["salesAndShop"]; pipelineEnabled: boolean }) {
  const t = useTranslations("DashboardHome");
  const funnel = sales.proposalFunnel;
  const stages = [
    { key: "draft", value: funnel.draft, color: "bg-muted-foreground/40" },
    { key: "sent", value: funnel.sent, color: "bg-orange-300 dark:bg-orange-400/70" },
    { key: "viewed", value: funnel.viewed, color: "bg-orange-400" },
    { key: "accepted", value: funnel.accepted, color: "bg-emerald-500" },
    { key: "invoiced", value: funnel.invoiced, color: "bg-emerald-600" },
  ] as const;
  const max = Math.max(1, ...stages.map((s) => s.value));
  const decided = funnel.accepted + funnel.invoiced + funnel.declined;
  const winRate = decided > 0 ? Math.round(((funnel.accepted + funnel.invoiced) / decided) * 100) : null;
  const total = stages.reduce((sum, s) => sum + s.value, 0) + funnel.declined;

  return (
    <Panel
      labelledBy="dash-sales"
      title={t("sales.title")}
      description={winRate === null ? t("sales.description") : t("sales.winRate", { percent: winRate })}
      action={<PanelLink href={pipelineEnabled ? DASHBOARD_ROUTES.pipeline : DASHBOARD_ROUTES.proposals}>{t("common.open")}</PanelLink>}
    >
      {total === 0 ? (
        <EmptyNote
          icon={FileText}
          title={t("sales.emptyTitle")}
          hint={t("sales.emptyHint")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={DASHBOARD_ROUTES.newProposal}>{t("actions.newProposal")}</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">
            {stages.map((stage) => (
              <li key={stage.key} className="grid grid-cols-[4.5rem_1fr_1.75rem] items-center gap-2 text-xs">
                <span className="truncate text-muted-foreground">{t(`sales.stage.${stage.key}`)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className={cn("block h-full rounded-full", stage.color)} style={{ width: `${stage.value > 0 ? Math.max(6, (stage.value / max) * 100) : 0}%` }} />
                </span>
                <span className="text-end font-semibold tabular-nums text-foreground">{stage.value}</span>
              </li>
            ))}
          </ul>
          {funnel.declined > 0 ? <p className="text-[11px] text-muted-foreground">{t("sales.declined", { count: funnel.declined })}</p> : null}
          {sales.acceptedAwaitingInvoicing > 0 ? (
            <CalloutLink href={DASHBOARD_ROUTES.acceptedProposals} tone="positive">
              {t("sales.readyToInvoice", { count: sales.acceptedAwaitingInvoicing })}
            </CalloutLink>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function ShopCard({
  sales,
  moduleEnabled,
  money,
  onModuleEnabled,
}: {
  sales: DashboardData["salesAndShop"];
  moduleEnabled: boolean;
  money: Money;
  onModuleEnabled: () => void;
}) {
  const t = useTranslations("DashboardHome");
  const [enabling, setEnabling] = useState(false);

  const enable = async () => {
    setEnabling(true);
    try {
      const res = await fetch("/api/workspace/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleKey: "SHOP", enabled: true }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("shop.enabled"));
      onModuleEnabled();
    } catch {
      toast.error(t("shop.enableFailed"));
    } finally {
      setEnabling(false);
    }
  };

  const orders = sales.publicShopOrders;
  const top = sales.topProducts[0];

  return (
    <Panel
      labelledBy="dash-shop"
      title={t("shop.title")}
      description={moduleEnabled && sales.shopEnabled ? t("shop.published", { count: sales.publishedProducts }) : t("shop.description")}
      action={moduleEnabled ? <PanelLink href={DASHBOARD_ROUTES.shop}>{t("common.open")}</PanelLink> : null}
    >
      {!moduleEnabled ? (
        <EmptyNote
          icon={Store}
          title={t("shop.offTitle")}
          hint={t("shop.offHint")}
          action={
            <Button size="sm" variant="outline" onClick={enable} disabled={enabling}>
              {enabling ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {t("shop.enable")}
            </Button>
          }
        />
      ) : !sales.shopEnabled ? (
        <EmptyNote
          icon={Store}
          title={t("shop.notLiveTitle")}
          hint={t("shop.notLiveHint")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={DASHBOARD_ROUTES.shopSettings}>{t("shop.setUp")}</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label={t("shop.revenueThisMonth")} value={money(sales.shopRevenueThisMonth)} extra={<Delta value={sales.revenueChangeVsPriorMonthPct} label={t("kpi.vsLastMonth")} />} />
            <MiniStat label={t("shop.orders30d")} value={sales.ordersLast30Days} extra={<Delta value={sales.orderChangeVsPrior30DaysPct} label={t("shop.vsPrior30d")} />} />
          </div>
          <p className="text-xs text-muted-foreground">
            {orders.total > 0 ? t("shop.orderSplit", { paid: orders.paid, pending: orders.pending, failed: orders.failed, percent: sales.shopOrderConversion }) : t("shop.noOrders")}
          </p>
          {top ? (
            <p className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2 text-xs">
              <span className="min-w-0">
                <span className="block text-[11px] text-muted-foreground">{t("shop.topProduct")}</span>
                <span className="block truncate font-medium text-foreground">{top.productName}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">{money(top.revenue)}</span>
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function OperationsCard({ operations, locale }: { operations: DashboardData["operations"]; locale: string }) {
  const t = useTranslations("DashboardHome");
  const movements = operations.recentInventoryMovements.slice(0, 3);
  const empty = !operations.hasOperationalData && movements.length === 0;

  return (
    <Panel labelledBy="dash-ops" title={t("ops.title")} description={t("ops.description")} action={<PanelLink href={DASHBOARD_ROUTES.inventory}>{t("common.open")}</PanelLink>}>
      {empty ? (
        <EmptyNote
          icon={Boxes}
          title={t("ops.emptyTitle")}
          hint={t("ops.emptyHint")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={DASHBOARD_ROUTES.inventory}>{t("ops.emptyAction")}</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            <MiniStat label={t("ops.lowStock")} value={operations.lowStockCount} href={DASHBOARD_ROUTES.inventory} tone={operations.lowStockCount > 0 ? "warning" : undefined} />
            <MiniStat label={t("ops.openOrders")} value={operations.openPurchaseOrders} href={DASHBOARD_ROUTES.purchaseOrders} />
            <MiniStat label={t("ops.openTasks")} value={operations.openTasks} tone={operations.blockedTasks > 0 ? "critical" : undefined} />
          </div>
          {operations.blockedTasks > 0 ? <p className="text-xs text-rose-600 dark:text-rose-400">{t("ops.blocked", { count: operations.blockedTasks })}</p> : null}
          {movements.length ? (
            <ul className="space-y-1.5">
              {movements.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-foreground">{m.productName}</span>
                  <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <span className={cn("font-semibold tabular-nums", m.quantity < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                      {m.quantity > 0 ? "+" : ""}
                      {m.quantity}
                    </span>
                    {formatRelative(m.createdAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function ComplianceCard({ trust, locale }: { trust: DashboardData["trust"]; locale: string }) {
  const t = useTranslations("DashboardHome");
  const passed = trust.integrityStatus === "PASSED" || trust.integrityStatus === "COMPLETED";
  const neverRun = trust.integrityStatus === "NOT_RUN";
  const tone: Tone = neverRun ? "neutral" : passed && trust.criticalViolations === 0 ? "positive" : "critical";
  const statusLabel = neverRun ? t("books.notRun") : passed && trust.criticalViolations === 0 ? t("books.passed") : t("books.needsReview");

  return (
    <Panel labelledBy="dash-books" title={t("books.title")} description={t("books.description")} action={<PanelLink href={DASHBOARD_ROUTES.tax}>{t("books.openTax")}</PanelLink>}>
      {(
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneChipClass[tone])}>
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{statusLabel}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {trust.lastIntegrityRunAt ? t("books.lastChecked", { when: formatRelative(trust.lastIntegrityRunAt, locale) }) : t("books.neverChecked")}
              </span>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <MiniStat label={t("books.violations")} value={trust.violationCount} href={DASHBOARD_ROUTES.reconciliation} tone={trust.criticalViolations > 0 ? "critical" : undefined} />
            <MiniStat label={t("books.taxBlockers")} value={trust.taxOpenBlockers} href={DASHBOARD_ROUTES.tax} tone={trust.taxCriticalBlockers > 0 ? "critical" : trust.taxOpenBlockers > 0 ? "warning" : undefined} />
            <MiniStat label={t("books.taxOverrides")} value={trust.taxOverrideCount} href={DASHBOARD_ROUTES.tax} />
          </div>
          {trust.taxCriticalBlockers > 0 ? (
            <CalloutLink href={DASHBOARD_ROUTES.tax} tone="critical">
              {t("books.criticalBlockers", { count: trust.taxCriticalBlockers })}
            </CalloutLink>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

/** One card per area of the business, each showing its headline numbers and linking into the module. */
export function DashboardModules({
  data,
  money,
  locale,
  enabledModules,
  onModuleEnabled,
}: {
  data: DashboardData;
  money: Money;
  locale: string;
  enabledModules: Set<string>;
  onModuleEnabled: () => void;
}) {
  const { permissions } = data;
  // Areas outside the member's role are left out altogether: the response holds no data for them, and a wall of padlocks helps nobody.
  const cards = [
    permissions.canViewSales ? <SalesCard key="sales" sales={data.salesAndShop} pipelineEnabled={enabledModules.has("REVENUE_PIPELINE")} /> : null,
    permissions.canViewSales ? <ShopCard key="shop" sales={data.salesAndShop} moduleEnabled={enabledModules.has("SHOP")} money={money} onModuleEnabled={onModuleEnabled} /> : null,
    permissions.canViewOperations ? <OperationsCard key="ops" operations={data.operations} locale={locale} /> : null,
    permissions.canViewTrust ? <ComplianceCard key="books" trust={data.trust} locale={locale} /> : null,
  ].filter(Boolean);
  if (cards.length === 0) return null;
  const columns = cards.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : cards.length === 3 ? "md:grid-cols-3" : cards.length === 2 ? "md:grid-cols-2" : "";
  return <div className={cn("grid gap-3", columns)}>{cards}</div>;
}
