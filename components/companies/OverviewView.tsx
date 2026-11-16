"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cardClass } from "./CompaniesShell";
import { money, type Overview } from "./format";

function Ring({ score }: { score: number }) {
  const tone = score >= 90 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-rose-500";
  return (
    <svg viewBox="0 0 36 36" className={cn("h-11 w-11 shrink-0", tone)} role="img" aria-label={`${score}%`}>
      <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
      <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(score / 100) * 97.4} 97.4`} transform="rotate(-90 18 18)" />
      <text x="18" y="21.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor">{score}</text>
    </svg>
  );
}

export function OverviewView({ canManage: canManageProp }: { canManage?: boolean }) {
  const t = useTranslations("CompaniesHub");
  const locale = useLocale();
  const { update } = useSession();
  const [data, setData] = useState<Overview | null>(null);
  const [canManage, setCanManage] = useState(canManageProp ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/companies/overview");
    const j = (await res.json().catch(() => ({}))) as { data?: Overview; groupRole?: string; error?: string };
    if (!res.ok || !j.data) { setError(j.error ?? t("error")); return; }
    setData(j.data); setCanManage(j.groupRole === "GROUP_OWNER" || j.groupRole === "GROUP_ADMIN");
  }, [t]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client fetch on mount; state is set after the awaited response
  useEffect(() => { void load(); }, [load]);

  async function switchTo(workspaceId: string) {
    setBusy(workspaceId);
    try {
      const res = await fetch("/api/company-context/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, groupId: data?.groupId }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; session?: { workspaceId?: string; groupId?: string | null } };
      if (!res.ok) { toast.error(j.error ?? t("error")); return; }
      await update({ workspaceId: j.session?.workspaceId ?? workspaceId, groupId: j.session?.groupId ?? data?.groupId ?? null });
      toast.success(t("card.switched"));
      await load();
    } finally { setBusy(null); }
  }
  async function toggleArchive(workspaceId: string, archived: boolean) {
    setBusy(workspaceId);
    try {
      const res = await fetch(`/api/companies/${workspaceId}/${archived ? "restore" : "archive"}`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { toast.error(j.error ?? t("error")); return; }
      toast.success(t("card.done")); await load();
    } finally { setBusy(null); }
  }

  if (error) return <p role="alert" className="text-sm text-rose-600">{error}</p>;
  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />;

  return (
    <div className="space-y-6">
      <section aria-label={t("overview.last30")} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.totals.map((tot) => (
          <div key={tot.currency} className={cn(cardClass, "p-4")}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{tot.currency} · {t("overview.companiesCount", { count: tot.companies })}</p>
              <p className="text-[11px] text-muted-foreground">{t("overview.last30")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([["overview.revenue", tot.revenue30d, ""], ["overview.outstanding", tot.outstanding, ""], ["overview.overdue", tot.overdueAmount, tot.overdueAmount > 0 ? "text-rose-600" : ""], ["overview.expenses", tot.expenses30d, ""]] as const).map(([k, v, tone]) => (
                <div key={k}><p className="text-[11px] font-semibold text-muted-foreground">{t(k)}</p><p className={cn("text-lg font-black tabular-nums", tone)}>{money(v, tot.currency, locale)}</p></div>
              ))}
            </div>
          </div>
        ))}
      </section>
      {data.totals.length > 1 && <p className="text-xs text-muted-foreground">{t("overview.totalsNote")}</p>}

      <section className={cn(cardClass, "p-4")} aria-labelledby="co-attn">
        <h2 id="co-attn" className="mb-2 text-sm font-black">{t("overview.attentionTitle")}</h2>
        {data.needsAttention.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" />{t("overview.allGood")}</p> : (
          <ul className="space-y-1.5 text-sm">{data.needsAttention.map((n) => <li key={`${n.workspaceId}-${n.reason}`} className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />{t(`overview.attention.${n.reason}`, { name: n.name })}</li>)}</ul>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {data.companies.map((c) => (
          <article key={c.workspaceId} className={cn(cardClass, "p-4", c.isArchived && "opacity-70")}>
            <header className="flex items-start gap-3">
              <Ring score={c.setup.score} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-black">{c.name}</h3>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{c.countryCode} · {c.baseCurrency}</span>
                  {c.isPrimary && <span className="rounded-full bg-orange-500/15 px-2 py-0.5 font-bold text-orange-700 dark:text-orange-300">{t("card.primary")}</span>}
                  {c.isCurrent && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">{t("card.current")}</span>}
                  {c.isArchived && <span className="rounded-full bg-zinc-500/15 px-2 py-0.5 font-bold">{t("card.archived")}</span>}
                </p>
              </div>
            </header>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div><dt className="text-muted-foreground">{t("overview.revenue")}</dt><dd className="font-bold tabular-nums">{money(c.revenue30d, c.baseCurrency, locale)}</dd></div>
              <div><dt className="text-muted-foreground">{t("overview.outstanding")}</dt><dd className="font-bold tabular-nums">{money(c.outstanding, c.baseCurrency, locale)}</dd></div>
              <div><dt className="text-muted-foreground">{t("overview.overdue")}</dt><dd className={cn("font-bold tabular-nums", c.overdueCount > 0 && "text-rose-600")}>{money(c.overdueAmount, c.baseCurrency, locale)}</dd></div>
            </dl>
            <p className="mt-2 text-[11px] text-muted-foreground">{t("card.members", { count: c.members })} · {t("card.modules", { count: c.modules.length })} · {t("card.setup", { score: c.setup.score })}</p>
            {c.setup.issues.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{c.setup.issues.map((i) => <li key={i} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-800 dark:text-amber-200">{t(`issue.${i}`)}</li>)}</ul>}
            <footer className="mt-3 flex flex-wrap gap-2">
              {!c.isCurrent && !c.isArchived && <Button size="sm" variant="outline" disabled={busy === c.workspaceId} onClick={() => void switchTo(c.workspaceId)} className="h-8 text-xs"><ArrowRightLeft className="me-1.5 h-3.5 w-3.5" />{t("card.switch")}</Button>}
              {canManage && <Button asChild size="sm" variant="ghost" className="h-8 text-xs"><Link href={`/companies/${c.workspaceId}`}><Pencil className="me-1.5 h-3.5 w-3.5" />{t("card.edit")}</Link></Button>}
              {canManage && !c.isPrimary && (!c.isCurrent || c.isArchived) && <Button size="sm" variant="ghost" disabled={busy === c.workspaceId} onClick={() => void toggleArchive(c.workspaceId, c.isArchived)} className="h-8 text-xs">{c.isArchived ? t("card.restore") : t("card.archive")}</Button>}
            </footer>
          </article>
        ))}
      </section>
    </div>
  );
}
