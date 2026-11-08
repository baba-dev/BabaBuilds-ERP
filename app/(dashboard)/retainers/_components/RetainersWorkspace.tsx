"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, RefreshCw, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { useFormat } from "@/hooks/use-format";
import type { RetainerListItemDto, RetainerListResponse, RetainerSummaryDto } from "@/lib/retainers/types";
import { RetainerDrawer } from "./RetainerDrawer";
import { AddUsageDialog, BillNowDialog, CancelRetainerDialog, DeleteRetainerDialog } from "./RetainerDialogs";
import { RetainerFilterBar } from "./RetainerFilterBar";
import { RetainerKpiStrip } from "./RetainerKpiStrip";
import { RetainerTable } from "./RetainerTable";
import { readApiError, type RetainerRowAction } from "./retainer-utils";
import { buildListUrl, useJson, useRetainersUrlState, type RetainerSort } from "./use-retainers-data";

const PAGE_SIZE = 15;

export function RetainersWorkspace() {
  const t = useTranslations("RetainersHub");
  const { locale } = useFormat();
  const router = useRouter();
  const { filters, retainerId, focus, update } = useRetainersUrlState();

  const list = useJson<RetainerListResponse>(buildListUrl(filters, PAGE_SIZE, focus));
  const summaryState = useJson<RetainerSummaryDto>("/api/retainers/summary");
  const rows = list.data?.data ?? [];
  const meta = list.data?.meta ?? null;

  const [reloadToken, setReloadToken] = useState(0);
  const [billTarget, setBillTarget] = useState<RetainerListItemDto | null>(null);
  const [cancelTarget, setCancelTarget] = useState<RetainerListItemDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RetainerListItemDto | null>(null);
  const [usageTarget, setUsageTarget] = useState<RetainerListItemDto | null>(null);

  const reloadAll = useCallback(() => {
    list.reload();
    summaryState.reload();
    setReloadToken((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload callbacks are stable
  }, []);

  // The assistant's create_retainer prefill hands over to the composer.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("erp_ai_payload");
      if (!raw) return;
      const { path, timestamp } = JSON.parse(raw) as { path?: string; timestamp?: number };
      if (path === "/retainers" && timestamp && Date.now() - timestamp < 15_000) router.replace("/retainers/new");
    } catch { /* malformed payload */ }
  }, [router]);

  useEffect(() => {
    if (!focus || !meta) return;
    if (meta.focusFound) update({ page: meta.page, retainer: focus });
    else { toast.error(t("toast.deepLinkMissing")); update({}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per resolved deep link
  }, [focus, meta?.page]);

  const hasFilters = Boolean(filters.q || filters.status.length || filters.frequency || filters.clientId);
  const clientName = filters.clientId ? rows.find((r) => r.clientId === filters.clientId)?.clientName ?? null : null;

  const quick = async (url: string, method: string, body: unknown, ok: string) => {
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { toast.error(await readApiError(res, t("toast.failed"))); return; }
      toast.success(ok);
      reloadAll();
    } catch { toast.error(t("toast.failed")); }
  };

  const handleAction = (action: RetainerRowAction, row: RetainerListItemDto) => {
    switch (action) {
      case "open": update({ retainer: row.id }); break;
      case "edit": router.push(`/retainers/${row.id}/edit`); break;
      case "billNow": setBillTarget(row); break;
      case "cancel": setCancelTarget(row); break;
      case "delete": setDeleteTarget(row); break;
      case "addUsage": setUsageTarget(row); break;
      case "pause": void quick(`/api/retainers/${row.id}/status`, "PATCH", { status: "PAUSED" }, t("toast.paused")); break;
      case "resume": void quick(`/api/retainers/${row.id}/status`, "PATCH", { status: "ACTIVE" }, t("toast.resumed")); break;
      case "viewInvoices": router.push(`/income?source=RETAINER&clientId=${row.clientId}`); break;
    }
  };

  const removeUsage = async (id: string, usageId: string) => {
    try {
      const res = await fetch(`/api/retainers/${id}/usage/${usageId}`, { method: "DELETE" });
      if (!res.ok) { toast.error(await readApiError(res, t("toast.failed"))); return; }
      reloadAll();
    } catch { toast.error(t("toast.failed")); }
  };

  const toggleSort = (field: RetainerSort) => {
    if (filters.sort === field) update({ dir: filters.dir === "asc" ? "desc" : "asc", page: 1 });
    else update({ sort: field, dir: "asc", page: 1 });
  };

  const empty = !list.loading && rows.length === 0 && !list.error;
  const dueStatuses = ["DUE" as const];

  return (
    <DashboardPageShell
      title={t("title")}
      description={t("description")}
      icon={<Repeat className="size-6 text-accent-strong" aria-hidden />}
      animated={false}
      primaryAction={
        <Button asChild variant="primary-action" size="lg" className="h-11 rounded-xl px-5 text-sm font-semibold">
          <Link href="/retainers/new" id="new-retainer-btn"><Plus className="size-4" aria-hidden />{t("newRetainer")}</Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <RetainerKpiStrip
          summary={summaryState.data}
          loading={summaryState.loading}
          locale={locale}
          onShowActive={() => update({ status: ["ACTIVE", "DUE"], page: 1 })}
          onShowDue={() => update({ status: dueStatuses, page: 1 })}
          onShowIssues={() => update({ status: ["ACTIVE", "DUE"], q: "", page: 1 })}
        />
        {summaryState.error && !summaryState.data && (
          <p role="alert" className="text-sm text-rose-600">{t("error.summary")} <button type="button" className="underline" onClick={summaryState.reload}>{t("error.retry")}</button></p>
        )}

        <RetainerFilterBar filters={filters} statusCounts={meta?.statusCounts ?? null} clientName={clientName} onChange={(patch) => update(patch)} />

        {list.error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
            <span>{t("error.load")}</span>
            <Button size="sm" variant="outline" onClick={list.reload} className="gap-1.5"><RefreshCw className="size-3.5" aria-hidden /> {t("error.retry")}</Button>
          </div>
        )}

        {empty ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><Repeat className="size-6" aria-hidden /></span>
            <h2 className="text-lg font-semibold">{hasFilters ? t("empty.filteredTitle") : t("empty.title")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{hasFilters ? t("empty.filteredDescription") : t("empty.description")}</p>
            {hasFilters ? (
              <Button variant="outline" onClick={() => update({ q: "", status: [], frequency: "", clientId: "", page: 1 })}>{t("filters.clear")}</Button>
            ) : (
              <Button asChild variant="primary-action"><Link href="/retainers/new"><Plus className="size-4" aria-hidden /> {t("empty.cta")}</Link></Button>
            )}
          </div>
        ) : (
          <RetainerTable
            rows={rows} loading={list.loading} refreshing={list.loading && rows.length > 0} locale={locale} filters={filters} activeId={retainerId}
            page={meta?.page ?? filters.page} totalPages={meta?.totalPages ?? 1} totalRecords={meta?.totalRecords ?? 0} limit={PAGE_SIZE}
            onSort={toggleSort} onAction={handleAction} onPage={(page) => update({ page })} onClientFilter={(clientId) => update({ clientId, page: 1 })}
          />
        )}
      </div>

      <RetainerDrawer retainerId={retainerId} locale={locale} reloadToken={reloadToken} onClose={() => update({ retainer: null })} onAction={handleAction} onRemoveUsage={removeUsage} />
      <BillNowDialog retainer={billTarget} locale={locale} onDone={reloadAll} onClose={() => setBillTarget(null)} />
      <CancelRetainerDialog retainer={cancelTarget} onDone={reloadAll} onClose={() => setCancelTarget(null)} />
      <DeleteRetainerDialog retainer={deleteTarget} onDone={() => { reloadAll(); if (deleteTarget && retainerId === deleteTarget.id) update({ retainer: null }); }} onClose={() => setDeleteTarget(null)} />
      <AddUsageDialog retainer={usageTarget} onDone={reloadAll} onClose={() => setUsageTarget(null)} />
    </DashboardPageShell>
  );
}
