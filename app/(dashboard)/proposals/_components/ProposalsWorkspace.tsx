"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FilePlus, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { useFormat } from "@/hooks/use-format";
import type { ProposalListItemDto, ProposalListResponse, ProposalSummaryDto } from "@/lib/proposals/types";
import { ProposalDrawer } from "./ProposalDrawer";
import { ConvertProposalDialog, DeclineProposalDialog, DeleteProposalDialog, RecordAcceptanceDialog, SendProposalDialog } from "./ProposalDialogs";
import { ProposalFilterBar } from "./ProposalFilterBar";
import { ProposalKpiStrip } from "./ProposalKpiStrip";
import { ProposalTable } from "./ProposalTable";
import { ProposalsTabs } from "./ProposalsTabs";
import { readApiError, type ProposalRowAction } from "./proposal-utils";
import { buildListUrl, useJson, useProposalsUrlState, type ProposalSort } from "./use-proposals-data";

const PAGE_SIZE = 15;

export function ProposalsWorkspace() {
  const t = useTranslations("ProposalsHub");
  const { locale } = useFormat();
  const router = useRouter();
  const { filters, proposalId, focus, update } = useProposalsUrlState();

  // The assistant's draft_proposal tool stores a prefill and sends the user here; the composer consumes it.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("erp_ai_payload");
      if (!raw) return;
      const { path, timestamp } = JSON.parse(raw) as { path?: string; timestamp?: number };
      if (path === "/proposals" && timestamp && Date.now() - timestamp < 15_000) router.replace("/proposals/new");
    } catch {
      /* ignore malformed payloads */
    }
  }, [router]);

  const list = useJson<ProposalListResponse>(buildListUrl(filters, PAGE_SIZE, focus));
  const summaryState = useJson<ProposalSummaryDto>("/api/proposals/summary");
  const rows = list.data?.data ?? [];
  const meta = list.data?.meta ?? null;

  const [reloadToken, setReloadToken] = useState(0);
  const [sendTarget, setSendTarget] = useState<ProposalListItemDto | null>(null);
  const [declineTarget, setDeclineTarget] = useState<ProposalListItemDto | null>(null);
  const [acceptTarget, setAcceptTarget] = useState<ProposalListItemDto | null>(null);
  const [convertTarget, setConvertTarget] = useState<ProposalListItemDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProposalListItemDto | null>(null);

  const reloadAll = useCallback(() => {
    list.reload();
    summaryState.reload();
    setReloadToken((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload callbacks are stable
  }, []);

  // Deep link (?protocolEntity=proposal&protocolRecord=<id>): the API returns the page that holds it.
  useEffect(() => {
    if (!focus || !meta) return;
    if (meta.focusFound) update({ page: meta.page, proposal: focus });
    else {
      toast.error(t("toast.deepLinkMissing"));
      update({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per resolved deep link
  }, [focus, meta?.page]);

  const hasFilters = Boolean(filters.q || filters.status.length || filters.clientId || filters.archived);
  const clientName = filters.clientId ? rows.find((r) => r.clientId === filters.clientId)?.clientName ?? null : null;

  const quick = async (url: string, method: string, body: unknown, ok: string) => {
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        toast.error(await readApiError(res, t("toast.failed")));
        return;
      }
      toast.success(ok);
      reloadAll();
    } catch {
      toast.error(t("toast.failed"));
    }
  };

  const handleAction = (action: ProposalRowAction, row: ProposalListItemDto) => {
    switch (action) {
      case "open":
        update({ proposal: row.id });
        break;
      case "edit":
        router.push(`/proposals/${row.id}/edit`);
        break;
      case "send":
        setSendTarget(row);
        break;
      case "decline":
        setDeclineTarget(row);
        break;
      case "accept":
        setAcceptTarget(row);
        break;
      case "convert":
        setConvertTarget(row);
        break;
      case "delete":
        setDeleteTarget(row);
        break;
      case "reopen":
        void quick(`/api/proposals/${row.id}/status`, "PATCH", { status: "DRAFT" }, t("toast.reopened"));
        break;
      case "archive":
        void quick(`/api/proposals/${row.id}`, "PATCH", { archived: true }, t("toast.archived"));
        break;
      case "unarchive":
        void quick(`/api/proposals/${row.id}`, "PATCH", { archived: false }, t("toast.unarchived"));
        break;
      case "copyLink":
        void navigator.clipboard?.writeText(`${window.location.origin}/p/${row.publicToken}`).then(() => toast.success(t("toast.linkCopied")));
        break;
      case "preview":
        window.open(`/p/${row.publicToken}`, "_blank", "noopener,noreferrer");
        break;
      case "viewInvoice":
        if (row.invoice) router.push(`/income?invoice=${row.invoice.id}`);
        break;
      case "duplicate":
        void (async () => {
          try {
            const res = await fetch(`/api/proposals/${row.id}/duplicate`, { method: "POST" });
            const payload = (await res.json().catch(() => null)) as { proposal?: { id: string }; error?: string } | null;
            if (!res.ok || !payload?.proposal) {
              toast.error(payload?.error || t("toast.failed"));
              return;
            }
            toast.success(t("toast.duplicated"));
            router.push(`/proposals/${payload.proposal.id}/edit`);
          } catch {
            toast.error(t("toast.failed"));
          }
        })();
        break;
    }
  };

  const toggleSort = (field: ProposalSort) => {
    if (filters.sort === field) update({ dir: filters.dir === "asc" ? "desc" : "asc", page: 1 });
    else update({ sort: field, dir: field === "title" || field === "proposalNo" || field === "validUntil" ? "asc" : "desc", page: 1 });
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
          <Link href="/proposals/new" id="new-proposal-btn">
            <FilePlus className="size-4" aria-hidden />
            {t("newProposal")}
          </Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <ProposalsTabs />
        <ProposalKpiStrip
          summary={summaryState.data}
          loading={summaryState.loading}
          locale={locale}
          onShowOpen={() => update({ status: ["SENT", "VIEWED", "REVISION_REQUESTED"], archived: false, page: 1 })}
          onShowReady={() => update({ status: ["ACCEPTED"], archived: false, page: 1 })}
          onShowExpiring={() => update({ status: ["SENT", "VIEWED", "REVISION_REQUESTED"], sort: "validUntil", dir: "asc", archived: false, page: 1 })}
        />
        {summaryState.error && !summaryState.data && (
          <p role="alert" className="text-sm text-rose-600">
            {t("error.summary")}{" "}
            <button type="button" className="underline" onClick={summaryState.reload}>
              {t("error.retry")}
            </button>
          </p>
        )}

        <ProposalFilterBar filters={filters} statusCounts={meta?.statusCounts ?? null} clientName={clientName} onChange={(patch) => update(patch)} />

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
              <Button variant="outline" onClick={() => update({ q: "", status: [], clientId: "", archived: false, page: 1 })}>
                {t("filters.clear")}
              </Button>
            ) : (
              <Button asChild variant="primary-action">
                <Link href="/proposals/new">
                  <FilePlus className="size-4" aria-hidden /> {t("empty.cta")}
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <ProposalTable
            rows={rows}
            loading={list.loading}
            refreshing={list.loading && rows.length > 0}
            locale={locale}
            filters={filters}
            activeId={proposalId}
            page={meta?.page ?? filters.page}
            totalPages={meta?.totalPages ?? 1}
            totalRecords={meta?.totalRecords ?? 0}
            limit={PAGE_SIZE}
            onSort={toggleSort}
            onAction={handleAction}
            onPage={(page) => update({ page })}
            onClientFilter={(clientId) => update({ clientId, page: 1 })}
          />
        )}
      </div>

      <ProposalDrawer proposalId={proposalId} locale={locale} reloadToken={reloadToken} onClose={() => update({ proposal: null })} onAction={handleAction} />
      <SendProposalDialog proposal={sendTarget} onDone={reloadAll} onClose={() => setSendTarget(null)} />
      <DeclineProposalDialog proposal={declineTarget} onDone={reloadAll} onClose={() => setDeclineTarget(null)} />
      <RecordAcceptanceDialog proposal={acceptTarget} onDone={reloadAll} onClose={() => setAcceptTarget(null)} />
      <ConvertProposalDialog proposal={convertTarget} locale={locale} onDone={reloadAll} onClose={() => setConvertTarget(null)} />
      <DeleteProposalDialog proposal={deleteTarget} onDone={() => { reloadAll(); if (deleteTarget && proposalId === deleteTarget.id) update({ proposal: null }); }} onClose={() => setDeleteTarget(null)} />
    </DashboardPageShell>
  );
}
