"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BellRing, FilePlus, FileText, Loader2, RefreshCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { useFormat } from "@/hooks/use-format";
import type { InvoiceDetailDto, InvoiceListItemDto, InvoiceListResponse, InvoiceSummaryDto } from "@/lib/invoices/types";
import { FilterBar } from "./FilterBar";
import { InvoiceDrawer } from "./InvoiceDrawer";
import { DeleteInvoiceDialog, RecordPaymentDialog, ReversePaymentDialog, VoidInvoiceDialog } from "./InvoiceDialogs";
import { InvoiceTable } from "./InvoiceTable";
import { KpiStrip } from "./KpiStrip";
import { TaxEstimateCard } from "./TaxEstimateCard";
import type { RowAction } from "./RowActionsMenu";
import { readApiError } from "./income-utils";
import { buildExportUrl, buildListUrl, useIncomeUrlState, useJson } from "./use-income-data";

const PAGE_SIZE = 15;

function summaryUrl(fy: string) {
  if (fy === "all") return "/api/invoices/summary?from=2000-01-01&to=2100-01-01";
  return `/api/invoices/summary?fy=${encodeURIComponent(fy)}`;
}

export function IncomeWorkspace() {
  const t = useTranslations("Income");
  const { locale, currency: sessionCurrency } = useFormat();
  const { filters, invoiceId, focus, update, currentFy } = useIncomeUrlState();

  const list = useJson<InvoiceListResponse>(buildListUrl(filters, PAGE_SIZE, focus));
  const summaryState = useJson<{ data: InvoiceSummaryDto }>(summaryUrl(filters.fy));
  const summary = summaryState.data?.data ?? null;
  const rows = list.data?.data ?? [];
  const meta = list.data?.meta ?? null;
  const baseCurrency = summary?.baseCurrency ?? sessionCurrency;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reloadToken, setReloadToken] = useState(0);
  const [payTarget, setPayTarget] = useState<InvoiceListItemDto | null>(null);
  const [voidTarget, setVoidTarget] = useState<InvoiceListItemDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceListItemDto | null>(null);
  const [reverseTarget, setReverseTarget] = useState<{ invoiceId: string; paymentId: string } | null>(null);
  const [bulkBusy, setBulkBusy] = useState<"send" | "remind" | null>(null);

  const reloadAll = useCallback(() => {
    list.reload();
    summaryState.reload();
    setReloadToken((n) => n + 1);
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload callbacks are stable
  }, []);

  // Deep link (?protocolEntity=invoice&protocolRecord=<id>): the API returns the page that holds the invoice.
  useEffect(() => {
    if (!focus || !meta) return;
    const found = (meta as { focusFound?: boolean }).focusFound;
    if (found) update({ page: meta.page, invoice: focus });
    else {
      toast.error(t("toast.deepLinkMissing"));
      update({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per resolved deep link
  }, [focus, meta?.page]);

  // Selection never outlives the page/filter it was made on.
  useEffect(() => setSelected(new Set()), [list.data]);

  const hasFilters = Boolean(filters.q || filters.status.length || filters.source.length || filters.currency || filters.clientId);
  const currencies = useMemo(() => {
    const set = new Set<string>([baseCurrency, ...(summary?.billedByCurrency.map((b) => b.currency) ?? [])]);
    if (filters.currency) set.add(filters.currency);
    return [...set];
  }, [baseCurrency, summary, filters.currency]);
  const clientName = filters.clientId ? rows.find((r) => r.clientId === filters.clientId)?.clientName ?? null : null;

  const runSimple = async (url: string, okKey: "invoiceSent" | "reminderSent", fallback: string) => {
    const toastId = toast.loading(t("toast.sending"));
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        toast.error(await readApiError(res, fallback), { id: toastId });
        return;
      }
      toast.success(t(`toast.${okKey}`), { id: toastId });
      reloadAll();
    } catch {
      toast.error(fallback, { id: toastId });
    }
  };

  const handleAction = (action: RowAction, row: InvoiceListItemDto | InvoiceDetailDto) => {
    switch (action) {
      case "open":
        update({ invoice: row.id });
        break;
      case "pay":
        setPayTarget(row);
        break;
      case "void":
        setVoidTarget(row);
        break;
      case "delete":
        setDeleteTarget(row);
        break;
      case "send":
        void runSimple(`/api/invoices/${row.id}/send`, "invoiceSent", t("toast.sendFailed"));
        break;
      case "remind":
        void runSimple(`/api/invoices/${row.id}/reminder`, "reminderSent", t("toast.sendFailed"));
        break;
      case "copy":
        void navigator.clipboard?.writeText(row.invoiceNumber).then(() => toast.success(t("toast.copied")));
        break;
    }
  };

  const runBulk = async (action: "send" | "remind") => {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(action);
    try {
      const res = await fetch("/api/invoices/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: [...selected] }),
      });
      const payload = (await res.json().catch(() => null)) as { succeeded?: number; failed?: number } | null;
      if (!res.ok || !payload) {
        toast.error(await readApiError(res, t("toast.sendFailed")));
        return;
      }
      const message = t("bulk.result", { ok: payload.succeeded ?? 0, failed: payload.failed ?? 0 });
      if ((payload.failed ?? 0) > 0) toast.warning(message);
      else toast.success(message);
      reloadAll();
    } catch {
      toast.error(t("toast.sendFailed"));
    } finally {
      setBulkBusy(null);
    }
  };

  const toggleSort = (field: typeof filters.sort) => {
    if (filters.sort === field) update({ dir: filters.dir === "asc" ? "desc" : "asc", page: 1 });
    else update({ sort: field, dir: field === "invoiceDate" || field === "amount" ? "desc" : "asc", page: 1 });
  };

  const empty = !list.loading && rows.length === 0 && !list.error;

  return (
    <DashboardPageShell
      title={t("title")}
      description={t("description")}
      icon={<FileText className="size-6 text-accent-strong" aria-hidden />}
      animated={false}
      primaryAction={
        <Button asChild variant="primary-action" size="lg" className="h-11 rounded-xl px-5 text-sm font-semibold">
          <Link href="/income/new" id="new-invoice-btn">
            <FilePlus className="size-4" aria-hidden />
            {t("newInvoice")}
          </Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <KpiStrip
          summary={summary}
          loading={summaryState.loading}
          locale={locale}
          onShowOverdue={() => update({ status: ["OVERDUE"], page: 1 })}
          onShowOpen={() => update({ status: ["OVERDUE", "PENDING", "PARTIALLY_PAID"], page: 1 })}
        />
        {summaryState.error && !summary && (
          <p role="alert" className="text-sm text-rose-600">
            {t("error.summary")}{" "}
            <button type="button" className="underline" onClick={summaryState.reload}>
              {t("error.retry")}
            </button>
          </p>
        )}
        {summary && <TaxEstimateCard summary={summary} locale={locale} onChanged={summaryState.reload} />}

        <FilterBar
          filters={filters}
          currentFy={currentFy}
          statusCounts={meta?.statusCounts ?? null}
          currencies={currencies}
          clientName={clientName}
          onChange={(patch) => update(patch)}
          exportHref={buildExportUrl(filters)}
        />

        {list.error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
            <span>{t("error.load")}</span>
            <Button size="sm" variant="outline" onClick={list.reload} className="gap-1.5">
              <RefreshCw className="size-3.5" aria-hidden /> {t("error.retry")}
            </Button>
          </div>
        )}

        {empty ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
              <FileText className="size-6" aria-hidden />
            </span>
            <h2 className="text-lg font-semibold">{hasFilters ? t("empty.filteredTitle") : t("empty.title")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{hasFilters ? t("empty.filteredDescription") : t("empty.description")}</p>
            {hasFilters ? (
              <Button variant="outline" onClick={() => update({ q: "", status: [], source: [], currency: "", clientId: "", page: 1 })}>
                {t("filters.clear")}
              </Button>
            ) : (
              <Button asChild variant="primary-action">
                <Link href="/income/new">
                  <FilePlus className="size-4" aria-hidden /> {t("empty.cta")}
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <InvoiceTable
            rows={rows}
            loading={list.loading}
            refreshing={list.loading && rows.length > 0}
            locale={locale}
            baseCurrency={baseCurrency}
            filters={filters}
            selected={selected}
            activeId={invoiceId}
            page={meta?.page ?? filters.page}
            totalPages={meta?.totalPages ?? 1}
            totalRecords={meta?.totalRecords ?? 0}
            limit={PAGE_SIZE}
            onSort={toggleSort}
            onToggle={(id) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onToggleAll={() => setSelected((prev) => (rows.every((r) => prev.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id))))}
            onAction={handleAction}
            onPage={(page) => update({ page })}
            onClientFilter={(clientId) => update({ clientId, page: 1 })}
          />
        )}
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-border bg-popover px-4 py-2.5 shadow-xl" role="region" aria-label={t("bulk.label")}>
          <span className="text-sm font-semibold tabular-nums">{t("bulk.selected", { count: selected.size })}</span>
          <Button size="sm" variant="outline" disabled={bulkBusy !== null} onClick={() => runBulk("send")} className="gap-1.5">
            {bulkBusy === "send" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            {t("bulk.send")}
          </Button>
          <Button size="sm" variant="outline" disabled={bulkBusy !== null} onClick={() => runBulk("remind")} className="gap-1.5">
            {bulkBusy === "remind" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BellRing className="size-4" aria-hidden />}
            {t("bulk.remind")}
          </Button>
          <Button size="icon" variant="ghost" className="size-8" onClick={() => setSelected(new Set())} aria-label={t("bulk.clear")}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      )}

      <InvoiceDrawer
        invoiceId={invoiceId}
        locale={locale}
        baseCurrency={baseCurrency}
        reloadToken={reloadToken}
        onClose={() => update({ invoice: null })}
        onAction={handleAction}
        onReversePayment={(invoice, paymentId) => setReverseTarget({ invoiceId: invoice, paymentId })}
      />
      <RecordPaymentDialog invoice={payTarget} locale={locale} onDone={reloadAll} onClose={() => setPayTarget(null)} />
      <VoidInvoiceDialog invoice={voidTarget} onDone={reloadAll} onClose={() => setVoidTarget(null)} />
      <DeleteInvoiceDialog invoice={deleteTarget} onDone={reloadAll} onClose={() => setDeleteTarget(null)} />
      <ReversePaymentDialog target={reverseTarget} onDone={reloadAll} onClose={() => setReverseTarget(null)} />
    </DashboardPageShell>
  );
}
