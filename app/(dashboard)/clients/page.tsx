"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Download, FileUp, GitMerge, Loader2, Plus, Search, Star, Tag, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { useFormat } from "@/hooks/use-format";
import { getBustedUrl } from "@/lib/cache-buster";
import { cn } from "@/lib/utils";
import { ClientFormDialog } from "./_components/ClientFormDialog";
import { DuplicatesDialog } from "./_components/DuplicatesDialog";
import { ClientRetainerChip } from "./_components/ClientRetainerChip";
import { api, compactMoney, daysSince, flag, HealthBadge, initials, money, type ClientRowData } from "./_components/shared";

type View = "active" | "vip" | "inactive" | "archived" | "all";
type Sort = "name" | "recent" | "outstanding" | "revenue" | "activity" | "risk";
type Summary = { total: number; vip: number; archived: number; newThisMonth: number; outstanding: number; overdue: number; withOverdue: number; billed: number; currency: string };
type ListResponse = { data: ClientRowData[]; meta: { currentPage: number; totalPages: number; totalRecords: number }; currency: string; summary?: Summary; tags?: Array<{ tag: string; count: number }> };

const VIEWS: View[] = ["active", "vip", "inactive", "archived", "all"];
const SORTS: Sort[] = ["name", "outstanding", "risk", "revenue", "activity", "recent"];

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "danger" | "good" }) {
  return (
    <div className="rounded-2xl border bg-card/60 p-4 shadow-xs backdrop-blur">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "danger" && "text-rose-600 dark:text-rose-400", tone === "warn" && "text-amber-600 dark:text-amber-400", tone === "good" && "text-emerald-600 dark:text-emerald-400")}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function ClientsInner() {
  const t = useTranslations("ClientsCrm");
  const router = useRouter();
  const sp = useSearchParams();
  const { locale, countryCode: workspaceCountry } = useFormat();
  const [rows, setRows] = useState<ClientRowData[]>([]);
  const [meta, setMeta] = useState({ currentPage: 1, totalPages: 1, totalRecords: 0 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tags, setTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [currency, setCurrency] = useState("INR");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  const [view, setView] = useState<View>("active");
  const [sort, setSort] = useState<Sort>("name");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRowData | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupCount, setDupCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => { const h = setTimeout(() => { setDebounced(q); setPage(1); }, 250); return () => clearTimeout(h); }, [q]);

  const load = useCallback(async (withSummary: boolean) => {
    const id = ++reqId.current;
    setLoading(true);
    const params = new URLSearchParams({ view, sort, page: String(page), limit: "24" });
    if (debounced) params.set("q", debounced);
    if (tag) params.set("tag", tag);
    if (withSummary) params.set("summary", "1");
    const r = await api<ListResponse>(`/api/clients?${params}`);
    if (id !== reqId.current) return;
    if (!r.ok) { setError(r.data.error ?? tRef.current("loadFailed")); setLoading(false); return; }
    setError(null);
    setRows(r.data.data); setMeta(r.data.meta); setCurrency(r.data.currency);
    if (r.data.summary) setSummary(r.data.summary);
    if (r.data.tags) setTags(r.data.tags);
    setLoading(false);
  }, [view, sort, page, debounced, tag]);

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => { api<{ groups: unknown[] }>("/api/clients/duplicates").then((r) => setDupCount(Array.isArray(r.data.groups) ? r.data.groups.length : 0)); }, []);
  useEffect(() => { setSelected(new Set()); }, [view, page, debounced, tag, sort]);
  useEffect(() => { if (sp.get("new") === "1") { setEditing(null); setFormOpen(true); router.replace("/clients"); } }, [sp, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "n") { e.preventDefault(); setEditing(null); setFormOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function bulk(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    const r = await api<{ updated?: number }>("/api/clients/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ids: [...selected], ...extra }) });
    setBusy(false);
    if (!r.ok) { toast.error(r.data.error ?? t("toast.failed")); return; }
    toast.success(t("toast.bulkDone", { count: r.data.updated ?? selected.size }));
    setSelected(new Set());
    void load(true);
  }

  const dateLocale = locale || "en-IN";
  const m = (n: number) => money(n, currency, dateLocale);
  const healthLabel = (h: ClientRowData["health"]) => t(`health.${h.label}` as never);
  const emptyBook = !loading && !error && meta.totalRecords === 0 && !debounced && !tag && view === "active";

  const exportHref = useMemo(() => { const p = new URLSearchParams({ view }); if (debounced) p.set("q", debounced); if (tag) p.set("tag", tag); return `/api/clients/export?${p}`; }, [view, debounced, tag]);

  return (
    <DashboardPageShell
      title={t("title")}
      description={t("subtitle")}
      icon={<Users className="size-5" aria-hidden />}
      primaryAction={<Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-2 size-4" aria-hidden />{t("new")}<kbd className="ml-2 hidden rounded border bg-background/20 px-1 text-[10px] md:inline">N</kbd></Button>}
      secondaryActions={
        <div className="flex flex-wrap gap-2">
          {dupCount > 0 && <Button variant="outline" onClick={() => setDupOpen(true)}><GitMerge className="mr-2 size-4" aria-hidden />{t("duplicates", { count: dupCount })}</Button>}
          <Button variant="outline" asChild><Link href="/import-manager"><FileUp className="mr-2 size-4" aria-hidden />{t("import")}</Link></Button>
          <Button variant="outline" asChild><a href={exportHref}><Download className="mr-2 size-4" aria-hidden />{t("export")}</a></Button>
        </div>
      }
    >

      <section aria-label={t("summary")} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {summary ? (
          <>
            <Stat label={t("stats.clients")} value={String(summary.total)} sub={t("stats.vip", { count: summary.vip })} />
            <Stat label={t("stats.outstanding")} value={compactMoney(summary.outstanding, summary.currency, dateLocale)} />
            <Stat label={t("stats.overdue")} value={compactMoney(summary.overdue, summary.currency, dateLocale)} tone={summary.overdue > 0 ? "danger" : "good"} sub={t("stats.withOverdue", { count: summary.withOverdue })} />
            <Stat label={t("stats.billed")} value={compactMoney(summary.billed, summary.currency, dateLocale)} />
            <Stat label={t("stats.newMonth")} value={String(summary.newThisMonth)} />
          </>
        ) : Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-2xl" />)}
      </section>

      <section aria-label={t("filters")} className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("search")} className="h-11 ps-9 pe-9" />
            {q && <button type="button" aria-label={t("clearSearch")} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => setQ("")}><X className="size-4" aria-hidden /></button>}
          </div>
          <label className="sr-only" htmlFor="client-sort">{t("sortBy")}</label>
          <select id="client-sort" value={sort} onChange={(e) => { setSort(e.target.value as Sort); setPage(1); }} className="h-11 rounded-md border border-input bg-background px-3 text-sm">
            {SORTS.map((s) => <option key={s} value={s}>{t(`sort.${s}` as never)}</option>)}
          </select>
          {tags.length > 0 && (
            <>
              <label className="sr-only" htmlFor="client-tag">{t("tag")}</label>
              <select id="client-tag" value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }} className="h-11 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{t("allTags")}</option>
                {tags.map((x) => <option key={x.tag} value={x.tag}>{x.tag} ({x.count})</option>)}
              </select>
            </>
          )}
        </div>
        <div role="tablist" aria-label={t("views")} className="flex gap-1.5 overflow-x-auto pb-1">
          {VIEWS.map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => { setView(v); setPage(1); }}
              className={cn("whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors", view === v ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted")}>
              {t(`view.${v}` as never)}
            </button>
          ))}
        </div>
      </section>

      {selected.size > 0 && (
        <div role="region" aria-label={t("bulk.bar")} className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border bg-background/95 p-2.5 shadow-lg backdrop-blur">
          <span className="px-2 text-sm font-medium">{t("bulk.selected", { count: selected.size })}</span>
          {view === "archived"
            ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void bulk("RESTORE")}><ArchiveRestore className="mr-1.5 size-4" aria-hidden />{t("bulk.restore")}</Button>
            : <Button size="sm" variant="outline" disabled={busy} onClick={() => void bulk("ARCHIVE")}><Archive className="mr-1.5 size-4" aria-hidden />{t("bulk.archive")}</Button>}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void bulk("SET_STATUS", { value: "VIP" })}><Star className="mr-1.5 size-4" aria-hidden />{t("bulk.markVip")}</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { const v = window.prompt(t("bulk.tagPrompt")); if (v?.trim()) void bulk("ADD_TAG", { value: v.trim() }); }}><Tag className="mr-1.5 size-4" aria-hidden />{t("bulk.addTag")}</Button>
          <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setSelected(new Set())}>{t("bulk.clear")}</Button>
        </div>
      )}

      {error ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm">
          <span>{error}</span><Button size="sm" variant="outline" onClick={() => void load(true)}>{t("retry")}</Button>
        </div>
      ) : emptyBook ? (
        <div className="grid place-items-center rounded-3xl border border-dashed p-12 text-center">
          <div className="max-w-sm space-y-3">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-600"><Users className="size-7" aria-hidden /></div>
            <h2 className="text-lg font-semibold">{t("empty.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("empty.body")}</p>
            <div className="flex justify-center gap-2"><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-2 size-4" aria-hidden />{t("new")}</Button><Button variant="outline" asChild><Link href="/import-manager">{t("import")}</Link></Button></div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="hidden grid-cols-[32px_minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
            <Checkbox checked={allSelected} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} aria-label={t("selectAll")} />
            <span>{t("col.client")}</span><span>{t("col.health")}</span><span className="text-end">{t("col.outstanding")}</span><span className="text-end">{t("col.billed")}</span><span>{t("col.lastInvoice")}</span>
          </div>
          <ul>
            {loading && rows.length === 0 ? Array.from({ length: 6 }).map((_, i) => <li key={i} className="border-b p-4 last:border-0"><Skeleton className="h-12 w-full" /></li>) : rows.map((c) => {
              const last = daysSince(c.metrics.lastInvoiceAt);
              return (
                <li key={c.id} className={cn("group relative grid items-center gap-x-3 gap-y-2 border-b px-4 py-3.5 transition-colors last:border-0 hover:bg-muted/40 lg:grid-cols-[32px_minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]", selected.has(c.id) && "bg-indigo-500/5", c.archivedAt && "opacity-70")}>
                  <Checkbox className="absolute end-3 top-3 lg:static" checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} aria-label={t("select", { name: c.name })} />
                  <Link href={`/clients/${c.id}`} className="flex min-w-0 items-center gap-3 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring lg:after:hidden">
                    <Avatar className="size-10 rounded-xl"><AvatarImage src={c.logoUrl ? getBustedUrl(c.logoUrl) : undefined} alt="" /><AvatarFallback className="rounded-xl bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">{initials(c.name)}</AvatarFallback></Avatar>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5"><span className="truncate font-medium">{c.name}</span>{c.status === "VIP" && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="VIP" />}{c.archivedAt && <Badge variant="outline" className="text-[10px]">{t("archivedBadge")}</Badge>}</span>
                      <span className="block truncate text-xs text-muted-foreground">{flag(c.countryCode)} {c.email ?? t("noEmail")}{c.tagList.length ? ` · ${c.tagList.slice(0, 2).join(", ")}` : ""}</span>
                    </span>
                  </Link>
                  <div className="flex flex-wrap items-center gap-2"><HealthBadge health={c.health} label={healthLabel(c.health)} />{c.credit.state === "OVER" && <Badge variant="outline" className="border-rose-500/40 text-rose-600">{t("credit.over")}</Badge>}{c.credit.state === "NEAR" && <Badge variant="outline" className="border-amber-500/40 text-amber-700">{t("credit.near")}</Badge>}</div>
                  <div className="lg:text-end"><span className="text-xs text-muted-foreground lg:hidden">{t("col.outstanding")}: </span><span className="font-medium tabular-nums">{m(c.metrics.outstanding)}</span>{c.metrics.overdue > 0 && <span className="block text-xs text-rose-600 dark:text-rose-400">{t("overdueAmount", { amount: m(c.metrics.overdue) })}</span>}</div>
                  <div className="lg:text-end"><span className="text-xs text-muted-foreground lg:hidden">{t("col.billed")}: </span><span className="tabular-nums">{m(c.metrics.billed)}</span><span className="block text-xs text-muted-foreground">{t("invoiceCount", { count: c.metrics.invoiceCount })}</span></div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{last === null ? t("neverInvoiced") : last === 0 ? t("today") : t("daysAgo", { count: last })}<ClientRetainerChip client={c as never} /></div>
                </li>
              );
            })}
          </ul>
          {rows.length === 0 && !loading && <p className="p-10 text-center text-sm text-muted-foreground">{t("noResults")}</p>}
        </div>
      )}

      {meta.totalPages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t("pageOf", { page: meta.currentPage, total: meta.totalPages, count: meta.totalRecords })}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" aria-label={t("prev")} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="size-4 rtl:rotate-180" aria-hidden /></Button>
            <Button variant="outline" size="icon" aria-label={t("next")} disabled={page >= meta.totalPages || loading} onClick={() => setPage((p) => p + 1)}>{loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />}</Button>
          </div>
        </nav>
      )}

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} client={editing} workspaceCountry={workspaceCountry} locale={dateLocale} onSaved={(id) => { if (!editing) router.push(`/clients/${id}`); else void load(true); }} />
      <DuplicatesDialog open={dupOpen} onOpenChange={setDupOpen} onChanged={() => { void load(true); api<{ groups: unknown[] }>("/api/clients/duplicates").then((r) => setDupCount(Array.isArray(r.data.groups) ? r.data.groups.length : 0)); }} />
    </DashboardPageShell>
  );
}

export default function ClientsPage() {
  return <Suspense fallback={null}><ClientsInner /></Suspense>;
}
