"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Briefcase, ExternalLink, LayoutGrid, List, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { OnboardingHint } from "@/components/onboarding/OnboardingHint";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import { ServiceCard } from "./ServiceCard";
import { ServiceForm } from "./ServiceForm";
import { filterServices, sortServices, usageOf, type ServiceItem, type ServiceSort } from "./service-types";

const VIEW_KEY = "services_view";

export function ServiceCatalog() {
  const t = useTranslations("ServiceCatalog");
  const router = useRouter();
  const reduce = useReducedMotion();
  const { fCurrency } = useFormat();

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ServiceSort>("name");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [toDelete, setToDelete] = useState<ServiceItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [shopSlug, setShopSlug] = useState<string | null>(null);

  useEffect(() => {
    // Read after mount so server and client render the same markup first.
    try {
      const stored = window.localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a per-viewer preference after hydration
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const changeView = (next: "grid" | "list") => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* convenience only */
    }
  };

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/services", { headers: { Accept: "application/json" } });
        const data = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(data)) throw new Error();
        if (!cancelled) setServices(data);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => d?.shopSlug && setShopSlug(d.shopSlug))
      .catch(() => undefined);
  }, []);

  const visible = useMemo(() => sortServices(filterServices(services, query), sort), [services, query, sort]);
  const stats = useMemo(() => {
    const prices = services.map((s) => Number(s.defaultPrice) || 0);
    return {
      count: services.length,
      average: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
      unmapped: services.filter((s) => !s.sacCode).length,
    };
  }, [services]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (service: ServiceItem) => {
    setEditing(service);
    setFormOpen(true);
  };

  const handleSaved = (saved: ServiceItem) =>
    setServices((prev) => (prev.some((s) => s.id === saved.id) ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved]));

  const duplicate = async (service: ServiceItem) => {
    const toastId = toast.loading(t("toast.duplicating"));
    try {
      const res = await fetch(`/api/services/${service.id}/duplicate`, { method: "POST" });
      const payload = (await res.json().catch(() => ({}))) as { service?: ServiceItem; error?: string };
      if (!res.ok || !payload.service) {
        toast.error(payload.error ?? t("toast.duplicateFailed"), { id: toastId });
        return;
      }
      handleSaved(payload.service);
      toast.success(t("toast.duplicated"), { id: toastId });
    } catch {
      toast.error(t("toast.networkError"), { id: toastId });
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/services/${toDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(payload.error ?? t("toast.deleteFailed"));
        return;
      }
      setServices((prev) => prev.filter((s) => s.id !== toDelete.id));
      toast.success(t("toast.deleted"));
    } catch {
      toast.error(t("toast.networkError"));
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  const startRetainer = (service: ServiceItem) => {
    try {
      sessionStorage.setItem(
        "erp_ai_payload",
        JSON.stringify({ path: "/retainers", data: { serviceTemplateId: service.id, amount: service.defaultPrice, serviceName: service.name }, timestamp: Date.now() }),
      );
    } catch {
      /* handoff is best-effort */
    }
    router.push("/retainers");
  };

  const isEmpty = !loading && !loadError && services.length === 0;
  const noMatches = !loading && services.length > 0 && visible.length === 0;
  const fade = reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } };

  return (
    <DashboardPageShell
      title={t("title")}
      description={t("description")}
      icon={<Briefcase className="size-6 text-accent-strong" aria-hidden />}
      animated={false}
      primaryAction={
        <div className="flex items-center gap-2">
          {shopSlug && (
            <Button asChild variant="outline" className="hidden h-11 gap-2 rounded-xl md:inline-flex">
              <a href={`/shop/${shopSlug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden /> {t("viewShop")}
              </a>
            </Button>
          )}
          <Button type="button" variant="primary-action" onClick={openAdd} className="h-11 gap-2 rounded-xl px-5 font-semibold">
            <Plus className="size-4" aria-hidden /> {t("add")}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <OnboardingHint stepId="create_service" title={t("onboardingTitle")} message={t("onboardingMessage")} />

        {/* Stats */}
        {!loading && services.length > 0 && (
          <motion.dl {...fade} className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-border/70 bg-card p-3 sm:p-4">
              <dt className="text-xs text-muted-foreground">{t("stats.services")}</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums sm:text-2xl">{stats.count}</dd>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-3 sm:p-4">
              <dt className="text-xs text-muted-foreground">{t("stats.average")}</dt>
              <dd className="mt-0.5 truncate text-base font-bold tabular-nums sm:text-2xl">{fCurrency(stats.average)}</dd>
            </div>
            <div className={cn("rounded-2xl border p-3 sm:p-4", stats.unmapped > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-border/70 bg-card")}>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                {stats.unmapped > 0 && <AlertTriangle className="size-3 text-amber-600" aria-hidden />}
                {t("stats.unmapped")}
              </dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums sm:text-2xl">{stats.unmapped}</dd>
            </div>
          </motion.dl>
        )}

        {/* Toolbar */}
        {services.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-11 rounded-xl ps-9" />
            </div>
            <div className="flex items-center gap-2">
              <Select value={sort} onValueChange={(v) => setSort(v as ServiceSort)}>
                <SelectTrigger className="h-11 w-full rounded-xl sm:w-[11.5rem]" aria-label={t("sort.label")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">{t("sort.name")}</SelectItem>
                  <SelectItem value="priceDesc">{t("sort.priceDesc")}</SelectItem>
                  <SelectItem value="priceAsc">{t("sort.priceAsc")}</SelectItem>
                  <SelectItem value="used">{t("sort.used")}</SelectItem>
                </SelectContent>
              </Select>
              <div className="inline-flex rounded-xl border border-border bg-card p-1" role="group" aria-label={t("view.label")}>
                {(["grid", "list"] as const).map((mode) => (
                  <button key={mode} type="button" onClick={() => changeView(mode)} aria-pressed={view === mode} aria-label={t(`view.${mode}`)} className={cn("rounded-lg p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === mode ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                    {mode === "grid" ? <LayoutGrid className="size-4" aria-hidden /> : <List className="size-4" aria-hidden />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {loadError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
            <span>{t("loadFailed")}</span>
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw className="size-3.5" aria-hidden /> {t("retry")}
            </Button>
          </div>
        )}

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[22rem] rounded-2xl" />
            ))}
          </div>
        )}

        {isEmpty && (
          <motion.div {...fade} className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
              <Briefcase className="size-7" aria-hidden />
            </span>
            <h2 className="text-lg font-semibold">{t("empty.title")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{t("empty.description")}</p>
            <Button onClick={openAdd} variant="primary-action" className="mt-2 gap-2">
              <Plus className="size-4" aria-hidden /> {t("empty.cta")}
            </Button>
          </motion.div>
        )}

        {noMatches && (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <p className="font-semibold">{t("noMatches", { query })}</p>
            <Button variant="outline" className="mt-3" onClick={() => setQuery("")}>
              {t("clearSearch")}
            </Button>
          </div>
        )}

        {!loading && visible.length > 0 && (
          <ul className={cn(view === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2.5")} aria-label={t("title")}>
            <AnimatePresence mode="popLayout" initial>
              {visible.map((service, index) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  index={index}
                  view={view}
                  formatPrice={fCurrency}
                  onEdit={openEdit}
                  onDuplicate={duplicate}
                  onDelete={setToDelete}
                  onRetainer={startRetainer}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {/* Mobile quick-add */}
      <motion.button
        type="button"
        onClick={openAdd}
        aria-label={t("add")}
        initial={reduce ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 380, damping: 22 }}
        whileTap={reduce ? undefined : { scale: 0.92 }}
        className="fixed bottom-24 end-4 z-30 flex size-14 items-center justify-center rounded-full bg-[color:var(--accent-primary,theme(colors.orange.600))] text-white shadow-xl md:hidden"
      >
        <Plus className="size-6" aria-hidden />
      </motion.button>

      <ServiceForm open={formOpen} service={editing} onOpenChange={setFormOpen} onSaved={handleSaved} />

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && !deleting && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.title", { name: toDelete?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && usageOf(toDelete) > 0
                ? t("delete.descriptionUsed", { proposals: toDelete.usage?.proposals ?? 0, retainers: toDelete.usage?.retainers ?? 0 })
                : t("delete.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardPageShell>
  );
}
