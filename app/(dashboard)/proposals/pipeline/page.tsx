import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getProposalPipelineRows,
  getProposalPipelineSummary,
} from "@/lib/commercial-workflow/pipeline";
import { formatCurrency } from "@/lib/currency";
import { DollarSign, Clock, AlertTriangle, TrendingUp, ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import { createCommercialActionTask } from "@/lib/commercial-workflow/tasks";
import { revalidatePath } from "next/cache";
import type { ComponentType } from "react";
import { isModuleEnabled, requireModule } from "@/lib/modules";

type InsightCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  colorClass: string;
  highlight?: boolean;
  href: string;
};

function InsightCard({
  title,
  value,
  subtitle,
  icon: Icon,
  colorClass,
  highlight,
  href,
}: InsightCardProps) {
  return (
    <Link href={href} className="block hover:-translate-y-1 transition-transform">
      <div className={`p-5 rounded-2xl border bg-white dark:bg-zinc-900 shadow-sm relative overflow-hidden ${
        highlight ? 'border-indigo-500 ring-1 ring-indigo-500/20' : 'border-zinc-200 dark:border-zinc-800'
      }`}>
        <div className={`w-10 h-10 flex flex-col justify-center items-center rounded-xl mb-4 ${colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{title}</p>
        <p className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-1">{value}</p>
        {subtitle && <p className="text-xs font-medium text-zinc-500 mt-2">{subtitle}</p>}
      </div>
    </Link>
  );
}

export default async function PipelineDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.workspaceId) redirect("/login");
  const t = await getTranslations("Pipeline");
  const { filter = "all" } = await searchParams;
  const pipelineModuleEnabled = await isModuleEnabled(session.workspaceId, "REVENUE_PIPELINE");

  if (!pipelineModuleEnabled) {
    return (
      <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-500">Revenue Pipeline</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              Enable Revenue Pipeline to unlock this view
            </h1>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300 max-w-2xl">
              Your quoting flow in <strong>/proposals</strong> stays fully available. Enable this module to access
              pipeline insights, stalled opportunity detection, and action task automation.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/settings"
                className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-indigo-700 transition-colors"
              >
                Enable in Settings
              </Link>
              <Link
                href="/proposals"
                className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Back to Proposals
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function generateStalledTasks(formData: FormData) {
    "use server";

    const session = await getServerSession(authOptions);
    if (!session?.workspaceId) redirect("/login");
    await requireModule(session.workspaceId, "REVENUE_PIPELINE");

    const filter = String(formData.get("filter") || "stalled");

    const proposals = await prisma.proposal.findMany({
      where: { workspaceId: session.workspaceId },
      include: {
        client: true,
        conversions: {
          include: { invoice: true, retainer: true, shopOrder: true },
        },
      },
      orderBy: { dateCreated: "desc" },
    });

    const pipelineRows = getProposalPipelineRows(proposals);

    const targetRows = pipelineRows.filter((row) => {
      if (filter === "stalled") return row.isStalled;
      if (filter === "accepted-not-converted")
        return (
          row.stage === "ACCEPTED" && row.stalledReason === "ACCEPTED_UNCONVERTED"
        );
      if (filter === "converted-unpaid")
        return (
          ["CONVERTED", "AWAITING_PAYMENT"].includes(row.stage) &&
          row.paymentState === "UNPAID"
        );
      if (filter === "viewed-not-accepted") return row.stage === "VIEWED";
      return row.isStalled;
    });

    for (const row of targetRows) {
      const action =
        row.nextBestAction === "CHASE_PAYMENT"
          ? "CHASE_PAYMENT"
          : row.nextBestAction === "CONVERT_TO_INVOICE"
            ? "CONVERT_TO_INVOICE"
            : row.nextBestAction === "SEND_REMINDER" ||
                row.nextBestAction === "FOLLOW_UP_VIEW"
              ? "SEND_REMINDER"
              : null;

      if (!action) continue;

      await createCommercialActionTask(
        session.workspaceId,
        row.proposal.id,
        row.proposal.title,
        action,
      );
    }

    revalidatePath("/proposals/pipeline");
  }

  // Load all proposals with downstream linking
  const proposals = await prisma.proposal.findMany({
    where: { workspaceId: session.workspaceId },
    include: {
      client: true,
      conversions: {
        include: { invoice: true, retainer: true, shopOrder: true }
      }
    },
    orderBy: { dateCreated: 'desc' }
  });

  const pipelineRows = getProposalPipelineRows(proposals);
  const summary = getProposalPipelineSummary(pipelineRows);

  const filteredRows = pipelineRows.filter((row) => {
    if (filter === 'stalled') return row.isStalled;
    if (filter === 'accepted-not-converted') return row.stage === 'ACCEPTED' && row.stalledReason === 'ACCEPTED_UNCONVERTED';
    if (filter === 'converted-unpaid') return ['CONVERTED', 'AWAITING_PAYMENT'].includes(row.stage) && row.paymentState === 'UNPAID';
    if (filter === 'viewed-not-accepted') return row.stage === 'VIEWED';
    if (filter === 'recently-paid') return row.stage === 'PAID';
    if (filter === 'draft') return row.stage === 'DRAFT';
    return true;
  });

  const formatMoney = (amount: number) => formatCurrency(amount, "INR", "en-IN");

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8 space-y-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight">{t("title")}</h1>
            <p className="text-sm text-zinc-500 font-medium">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <form action={generateStalledTasks}>
              <input type="hidden" name="filter" value={filter} />
              <button
                type="submit"
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-zinc-900 dark:text-zinc-50 font-bold text-xs uppercase tracking-widest rounded-lg shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                {t("actions.createTasks")}
              </button>
            </form>
            <Link href="/proposals" className="bg-indigo-600 px-4 py-2 text-white font-bold text-xs uppercase tracking-widest rounded-lg shadow-sm hover:bg-indigo-700 transition-colors">
              {t("proposalBuilderCta")}
            </Link>
          </div>
        </div>

        {/* Executive Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <InsightCard 
            title={t("cards.totalPipeline")}
            value={formatMoney(summary.totalPipelineValue)}
            subtitle={t("cards.activeDocuments", { count: pipelineRows.length })}
            icon={DollarSign}
            colorClass="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400"
            href="?filter=all"
          />
          <InsightCard 
            title={t("cards.acceptedAwaitingInvoice")}
            value={formatMoney(summary.acceptedNotConvertedValue)}
            subtitle={t("cards.proposalsCount", { count: summary.counts["ACCEPTED"] || 0 })}
            icon={TrendingUp}
            colorClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400"
            highlight={summary.acceptedNotConvertedValue > 0}
            href="?filter=accepted-not-converted"
          />
          <InsightCard 
            title={t("cards.convertedUnpaid")}
            value={formatMoney(summary.convertedUnpaidValue)}
            subtitle={t("cards.missingCashFlow")}
            icon={Clock}
            colorClass="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400"
            highlight={summary.convertedUnpaidValue > 0}
            href="?filter=converted-unpaid"
          />
          <InsightCard 
            title={t("cards.stalledPipeline")}
            value={formatMoney(summary.stalledValue)}
            subtitle={t("cards.itemsRequiringAttention", { count: summary.stalledCount })}
            icon={AlertTriangle}
            colorClass="bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400"
            highlight={summary.stalledCount > 0}
            href="?filter=stalled"
          />
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
          <div className="border-b border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50 dark:bg-zinc-950 flex flex-wrap gap-2">
            {[
              { id: 'all', label: t("filters.all") },
              { id: 'stalled', label: t("filters.stalled") },
              { id: 'accepted-not-converted', label: t("filters.acceptedNotConverted") },
              { id: 'converted-unpaid', label: t("filters.convertedUnpaid") },
              { id: 'viewed-not-accepted', label: t("filters.viewedNotAccepted") },
            ].map(f => (
              <Link 
                key={f.id} 
                href={`?filter=\${f.id}`} 
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors \${
                  filter === f.id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-zinc-50 dark:bg-zinc-950/50 text-zinc-500 text-xs font-bold uppercase tracking-widest border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="p-4">{t("table.proposal")}</th>
                  <th className="p-4">{t("table.client")}</th>
                  <th className="p-4">{t("table.stage")}</th>
                  <th className="p-4">{t("table.payment")}</th>
                  <th className="p-4 text-right">{t("table.value")}</th>
                  <th className="p-4">{t("table.nextAction")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredRows.map((row) => (
                  <tr key={row.proposal.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-zinc-400" />
                        <div>
                          <Link href={`/proposals/\${row.proposal.id}`} className="font-bold text-indigo-600 hover:underline">
                            {row.traceabilityId}
                          </Link>
                          <p className="text-zinc-500 text-xs truncate max-w-[200px]">{row.proposal.title}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-medium text-zinc-900 dark:text-zinc-100">{row.clientName}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest \${
                          row.isStalled ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                        }`}>
                          {row.stage}
                        </span>
                        {row.isStalled && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-1 font-mono uppercase tracking-widest">{row.ageInStageDays}d in stage</p>
                    </td>
                    <td className="p-4">
                       <span className={`text-[10px] uppercase font-bold tracking-widest \${
                         row.paymentState === 'PAID' ? 'text-emerald-600' :
                         row.paymentState === 'PARTIAL' ? 'text-amber-600' :
                         row.paymentState === 'UNPAID' ? 'text-rose-600' : 'text-zinc-400'
                       }`}>
                         {row.paymentState}
                       </span>
                    </td>
                    <td className="p-4 text-right font-bold text-zinc-900 dark:text-zinc-100">
                      {formatMoney(row.totalValue)}
                    </td>
                    <td className="p-4">
                      {row.nextBestAction !== 'NONE' ? (
                        <Link 
                          href={row.nextBestAction === 'CHASE_PAYMENT' ? `/income?search=${row.traceabilityId}` : row.nextBestAction === 'CONVERT_TO_INVOICE' ? `/proposals/${row.proposal.id}` : '#'}
                          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 px-2 py-1 rounded inline-flex transition-colors"
                        >
                          {row.nextBestAction.replace(/_/g, ' ')} <ChevronRight className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span className="text-zinc-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-zinc-500 font-medium">
                      No proposals match this operational filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
