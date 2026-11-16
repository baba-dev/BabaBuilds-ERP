"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cardClass, inputClass } from "./CompaniesShell";
import { money, type Overview } from "./format";

/** Per-currency comparison bars: each company's billed, outstanding and expenses side by side. */
export function DashboardView() {
  const t = useTranslations("CompaniesHub");
  const locale = useLocale();
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => { void fetch("/api/companies/overview").then((r) => r.json()).then((j: { data?: Overview }) => setData(j.data ?? null)).catch(() => undefined); }, []);
  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />;
  const active = data.companies.filter((c) => !c.isArchived);
  const currencies = [...new Set(active.map((c) => c.baseCurrency))];
  if (active.length === 0) return <p className="text-sm text-muted-foreground">{t("dash.empty")}</p>;
  return (
    <div className="space-y-6">
      {currencies.map((cur) => {
        const rows = active.filter((c) => c.baseCurrency === cur);
        const max = Math.max(1, ...rows.flatMap((c) => [c.revenue30d, c.outstanding, c.expenses30d]));
        return (
          <section key={cur} className={cn(cardClass, "p-5")} aria-label={`${t("dash.compare")} ${cur}`}>
            <h2 className="mb-4 text-sm font-black">{t("dash.compare")} · {cur} <span className="font-normal text-muted-foreground">({t("overview.last30")})</span></h2>
            <div className="space-y-5">
              {rows.map((c) => (
                <div key={c.workspaceId}>
                  <p className="mb-1.5 text-sm font-semibold">{c.name}</p>
                  {([["overview.revenue", c.revenue30d, "bg-emerald-500"], ["overview.outstanding", c.outstanding, "bg-amber-500"], ["overview.expenses", c.expenses30d, "bg-sky-500"]] as const).map(([k, val, bar]) => (
                    <div key={k} className="mb-1 flex items-center gap-2 text-xs">
                      <span className="w-24 shrink-0 text-muted-foreground">{t(k)}</span>
                      <div className="h-2 flex-1 rounded-full bg-muted"><div className={cn("h-full rounded-full", bar)} style={{ width: `${(val / max) * 100}%` }} /></div>
                      <span className="w-28 shrink-0 text-end font-semibold tabular-nums">{money(val, cur, locale)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ReportsView() {
  const t = useTranslations("CompaniesHub");
  const items = [
    { href: "/reporting/group_revenue", title: t("reports.revenue"), desc: t("reports.revenueDesc"), cta: t("reports.open") },
    { href: "/reporting", title: t("reports.center"), desc: t("reports.centerDesc"), cta: t("reports.open") },
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("reports.intro")}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={cn(cardClass, "group block p-5 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500")}>
            <p className="font-black group-hover:text-orange-600">{i.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{i.desc}</p>
            <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-orange-600">{i.cta}<ExternalLink className="h-3.5 w-3.5" /></p>
          </Link>
        ))}
      </div>
    </div>
  );
}

type GroupData = { group: { id: string; name: string; planTier: string; subscriptionStatus: string; subscriptionEndsAt: string | null; billingWorkspace: { name: string } | null }; companies: { workspaceId: string; name: string; isActive: boolean; planTier: string; subscriptionStatus: string }[]; members: number; modules: { moduleKey: string; companies: number }[] };

export function BillingView() {
  const t = useTranslations("CompaniesHub");
  const locale = useLocale();
  const [d, setD] = useState<GroupData | null>(null);
  useEffect(() => { void fetch("/api/companies/group").then((r) => r.json()).then((j: { data?: GroupData }) => setD(j.data ?? null)).catch(() => undefined); }, []);
  if (!d) return <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />;
  const stat = (label: string, value: string) => <div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><p className="text-lg font-black">{value}</p></div>;
  return (
    <div className="space-y-6">
      <section className={cn(cardClass, "grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4")}>
        {stat(t("billing.plan"), d.group.planTier)}{stat(t("billing.status"), d.group.subscriptionStatus)}
        {stat(t("billing.renews"), d.group.subscriptionEndsAt ? new Date(d.group.subscriptionEndsAt).toLocaleDateString(locale) : t("billing.none"))}
        {stat(t("billing.billedTo"), d.group.billingWorkspace?.name ?? t("billing.none"))}
        {stat(t("billing.seats"), String(d.members))}
      </section>
      <section className={cn(cardClass, "p-5")}>
        <h2 className="mb-3 text-sm font-black">{t("billing.companyPlans")}</h2>
        <ul className="divide-y divide-border/70 text-sm">{d.companies.map((c) => <li key={c.workspaceId} className="flex justify-between py-2"><span className={cn(!c.isActive && "text-muted-foreground")}>{c.name}</span><span className="text-muted-foreground">{c.planTier} · {c.subscriptionStatus}</span></li>)}</ul>
      </section>
      <section className={cn(cardClass, "p-5")}>
        <h2 className="mb-3 text-sm font-black">{t("billing.modules")}</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{d.modules.map((m) => <li key={m.moduleKey} className="flex justify-between rounded-lg bg-muted/40 px-3 py-2"><span>{m.moduleKey.replaceAll("_", " ")}</span><span className="text-muted-foreground">{t("billing.modulesCompanies", { count: m.companies })}</span></li>)}</ul>
      </section>
      <p className="text-xs text-muted-foreground">{t("billing.manage")}</p>
    </div>
  );
}

export function SettingsView() {
  const t = useTranslations("CompaniesHub");
  const [name, setName] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch("/api/companies/group").then((r) => r.json()).then((j: { data?: GroupData; canManage?: boolean }) => { setName(j.data?.group.name ?? ""); setCanManage(!!j.canManage); }).catch(() => undefined); }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const res = await fetch("/api/companies/group", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) toast.error(j.error ?? t("error")); else toast.success(t("form.saved"));
    } finally { setBusy(false); }
  }
  return (
    <form onSubmit={(e) => void save(e)} className={cn(cardClass, "max-w-xl space-y-3 p-5")}>
      <label className="block text-xs font-semibold">{t("settings.groupName")}<input value={name} disabled={!canManage} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} /></label>
      <p className="text-xs text-muted-foreground">{canManage ? t("settings.note") : t("settings.readOnly")}</p>
      {canManage && <Button type="submit" disabled={busy || !name.trim()} className="h-10 bg-orange-600 text-white hover:bg-orange-500">{t("settings.save")}</Button>}
    </form>
  );
}
