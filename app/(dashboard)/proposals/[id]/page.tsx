import type { ComponentType } from "react";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { 
  Building2, CheckCircle2, Clock, FileText, Send, Eye, XCircle, DollarSign, Receipt
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import {
  convertProposalToInvoiceFormAction,
  convertProposalToRetainerFormAction,
} from "./actions";
import { getTranslations } from "next-intl/server";
import { FREE_TIER_MONTHLY_INVOICE_LIMIT } from "@/lib/pricing";

interface TimelineItemProps {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  title: string;
  date?: Date | string | null;
  subtitle?: string | null;
}

function TimelineItem({ active, icon: Icon, title, date, subtitle }: TimelineItemProps) {
  return (
    <div className={`flex flex-col items-center gap-2 ${active ? "text-indigo-600" : "text-zinc-400 opacity-50"}`}>
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center ${active ? "bg-indigo-100 dark:bg-indigo-900/50" : "bg-zinc-100 dark:bg-zinc-800"}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest">{title}</p>
        {active && date && <p className="text-[10px] text-zinc-500 mt-1">{format(new Date(date), "MMM dd, hh:mm a")}</p>}
        {subtitle && <p className="text-[10px] text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export default async function ProposalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ billing?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.workspaceId) redirect("/login");

  const t = await getTranslations("ProposalDetail");
  const { id } = await params;
  const billingQuery = searchParams ? await searchParams : {};
  const showInvoiceLimitNotice = billingQuery.billing === "free_invoice_month";

  const proposal = await prisma.proposal.findUnique({
    where: { 
      id,
      workspaceId: session.workspaceId 
    },
    include: {
      client: true,
      items: true,
      conversions: {
        include: { invoice: true, retainer: true, shopOrder: true }
      },
      generatedInvoices: true,
      generatedRetainers: true,
      billingMilestones: true
    }
  });

  if (!proposal) redirect("/proposals");

  const logs = await prisma.appActivityLog.findMany({
    where: {
      entityType: "proposal",
      entityId: id,
      workspaceId: session.workspaceId,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const formatMoney = (amount: unknown) => formatCurrency(Number(amount), "INR", "en-IN");

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {showInvoiceLimitNotice && (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          >
            You have reached the limit of {FREE_TIER_MONTHLY_INVOICE_LIMIT} invoices this month on the Free plan.
            Upgrade to Pro or Team for unlimited invoices.
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex gap-2 items-center mb-2">
              <Link href="/proposals" className="text-xs font-bold text-indigo-600 uppercase hover:underline mr-4 tracking-widest">
                {t("back")}
              </Link>
              <span className="text-xs font-bold px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded">{proposal.proposalNo}</span>
              <span className="text-xs font-bold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded">{proposal.status}</span>
            </div>
            <h1 className="text-3xl font-black">{proposal.title}</h1>
            <div className="flex items-center gap-2 text-zinc-500 mt-2 text-sm font-medium">
              <Building2 className="w-4 h-4" /> {t("preparedFor", { clientName: proposal.client.name })}
            </div>
          </div>
          <div className="text-right">
             <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("valueLabel")}</p>
             <p className="text-2xl font-black text-indigo-600">{formatMoney(proposal.totalAmount)}</p>
          </div>
        </div>

        {/* Timeline Surface */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-8 border-b pb-2">{t("lifecycleTimeline")}</h2>
          <div className="flex justify-between relative px-4">
            
            <div className="absolute top-5 left-10 right-10 h-0.5 bg-zinc-200 dark:bg-zinc-800 -z-10" />
            <div 
              className="absolute top-5 left-10 h-0.5 bg-indigo-500 -z-10 transition-all" 
              style={{ width: proposal.firstConvertedAt ? '100%' : proposal.acceptedAt ? '75%' : proposal.firstViewedAt ? '50%' : proposal.sentAt ? '25%' : '0%' }}
            />

            <TimelineItem active={true} icon={FileText} title={t("timeline.drafted")} date={proposal.dateCreated} />
            <TimelineItem active={!!proposal.sentAt} icon={Send} title={t("timeline.sent")} date={proposal.sentAt} />
            <TimelineItem active={!!proposal.firstViewedAt} icon={Eye} title={t("timeline.viewed")} date={proposal.lastViewedAt} subtitle={t("timeline.views", { count: proposal.viewCount })} />
            
            {proposal.declinedAt ? (
               <TimelineItem active={true} icon={XCircle} title={t("timeline.requestedChanges")} date={proposal.declinedAt} />
            ) : (
               <TimelineItem active={!!proposal.acceptedAt} icon={CheckCircle2} title={t("timeline.accepted")} date={proposal.acceptedAt} subtitle={proposal.acceptedByName} />
            )}

            <TimelineItem active={!!proposal.firstConvertedAt} icon={DollarSign} title={t("timeline.converted")} date={proposal.firstConvertedAt} />

            {proposal.firstConvertedAt && proposal.generatedInvoices.length > 0 && proposal.generatedInvoices.every((i) => i.status === 'PAID') && (
              <TimelineItem active={true} icon={CheckCircle2} title={t("timeline.reconciled")} date={proposal.generatedInvoices[0].dateReceived ?? proposal.generatedInvoices[0].createdAt} subtitle={t("timeline.revenueSecured")} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b pb-2">{t("downstreamArtifacts")}</h2>
              {proposal.firstConvertedAt ? (
                 <div className="space-y-4">
                   {proposal.conversions.map((conv) => (
                      <div key={conv.id} className="p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-950 space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <Receipt className="text-indigo-500 w-5 h-5"/>
                            <div>
                              <p className="font-bold text-sm">
                                {conv.invoice
                                  ? t("artifact.invoice", { invoiceNumber: conv.invoice.invoiceNumber })
                                  : conv.retainer
                                    ? t("artifact.retainer")
                                    : conv.shopOrder
                                      ? t("artifact.serviceOrder")
                                      : t("artifact.conversion")}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {conv.invoice ? formatMoney(conv.invoice.totalAmount) : conv.retainer ? formatMoney(conv.retainer.amount) : conv.shopOrder ? formatMoney(conv.shopOrder.amount ?? 0) : ""}
                              </p>
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-zinc-200 text-xs font-bold rounded">
                            {conv.invoice?.status || conv.retainer?.status || conv.shopOrder?.status || conv.conversionType}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {conv.invoice && (
                            <Link href={`/income?search=${encodeURIComponent(conv.invoice.invoiceNumber)}`} className="text-indigo-600 font-bold hover:underline">
                              Open invoice
                            </Link>
                          )}
                          {conv.retainer && (
                            <Link href={`/retainers`} className="text-indigo-600 font-bold hover:underline">
                              Open retainers
                            </Link>
                          )}
                        </div>
                      </div>
                   ))}
                   {proposal.conversions.length === 0 && <p className="text-sm text-zinc-500">No matching conversions in this list.</p>}
                 </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-zinc-400">
                  <p className="text-sm font-medium">{t("noDownstreamArtifacts")}</p>
                </div>
              )}
            </div>
            
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b pb-2">{t("billingScheduleMilestones")}</h2>
              {proposal.billingMilestones && proposal.billingMilestones.length > 0 ? (
                <div className="space-y-4">
                  {proposal.billingMilestones.map((milestone) => (
                    <div key={milestone.id} className="p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-950 space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-bold text-sm">{milestone.title}</p>
                          {milestone.description && <p className="text-xs text-zinc-500 mt-1">{milestone.description}</p>}
                          {milestone.dueDate && (
                            <p className="text-[10px] text-zinc-400 mt-1">
                              Due: {format(new Date(milestone.dueDate), "MMM dd, yyyy")}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-extrabold text-sm text-indigo-600">{formatMoney(milestone.amount)}</p>
                          <span className={`inline-block px-2 py-0.5 mt-1 rounded text-[10px] font-bold uppercase tracking-widest ${
                            milestone.status === 'PAID' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                            milestone.status === 'INVOICED' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300' :
                            'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}>
                            {milestone.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">{t("noMilestonesDefined")}</p>
              )}
            </div>
          </div>
          
          <div className="space-y-6">
            {proposal.status === "ACCEPTED" && !proposal.firstConvertedAt && (
              <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-6 text-center shadow-sm">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <h3 className="font-bold text-emerald-900 dark:text-emerald-400 mb-1">{t("readyForConversion")}</h3>
                <p className="text-xs text-emerald-700/80 mb-4 tracking-wide leading-relaxed">{t("readyForConversionDesc")}</p>

                <div className="space-y-2">
                  <form action={convertProposalToInvoiceFormAction}>
                    <input type="hidden" name="proposalId" value={proposal.id} />
                    <button
                      type="submit"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold tracking-widest uppercase text-xs h-10 rounded shadow-md transition-all"
                    >
                      {t("convertToInvoice")}
                    </button>
                  </form>

                  <form action={convertProposalToRetainerFormAction} className="space-y-2">
                    <input type="hidden" name="proposalId" value={proposal.id} />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        name="amount"
                        placeholder={t("retainerForm.amount")}
                        className="h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-emerald-800/40 dark:bg-zinc-950 dark:text-zinc-50"
                        defaultValue={String(Number(proposal.totalAmount ?? 0) || "")}
                        inputMode="decimal"
                      />
                      <select
                        name="frequency"
                        defaultValue="MONTHLY"
                        className="h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-emerald-800/40 dark:bg-zinc-950 dark:text-zinc-50"
                      >
                        <option value="MONTHLY">Monthly</option>
                        <option value="QUARTERLY">Quarterly</option>
                        <option value="ANNUALLY">Annually</option>
                      </select>
                    </div>
                    <input
                      name="serviceName"
                      placeholder="Service name"
                      className="h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-emerald-800/40 dark:bg-zinc-950 dark:text-zinc-50"
                      defaultValue={proposal.title}
                    />
                    <button
                      type="submit"
                      className="w-full bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 font-bold tracking-widest uppercase text-xs h-10 rounded shadow-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all"
                    >
                      {t("convertToRetainer")}
                    </button>
                  </form>

                </div>
              </div>
            )}
            
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b pb-2">{t("clientDetails")}</h2>
              <p className="font-bold">{proposal.client.name}</p>
              <p className="text-sm text-zinc-500">{proposal.client.email || "No email on file"}</p>
              
              <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
                 <p className="text-xs text-zinc-500 font-medium">{t("publicUrl")}</p>
                 <a href={`/p/${proposal.publicToken}`} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 mt-1 block truncate hover:underline">
                   {`/p/${proposal.publicToken}`}
                 </a>
              </div>
              
              {proposal.clientSignatureBase64 && (
                <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mb-2">Digital Signature</p>
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-4 border rounded-xl shadow-inner max-w-[200px]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- dynamic or user-supplied image source; next/image remote config not applicable */}
                    <img src={proposal.clientSignatureBase64} alt="Client Signature" className="h-16 w-auto object-contain mx-auto" />
                  </div>
                  <div className="mt-2 text-[10px] text-zinc-400 space-y-0.5 font-medium leading-relaxed">
                    <p>Signed By: <span className="font-bold text-zinc-700 dark:text-zinc-300">{proposal.acceptedByName || proposal.client.name}</span></p>
                    <p>IP Address: <span className="font-mono text-zinc-600 dark:text-zinc-400">{proposal.clientIp || "Unavailable"}</span></p>
                    <p>Signed At: <span>{proposal.acceptedAt ? format(new Date(proposal.acceptedAt), "MMM dd, yyyy hh:mm a") : "N/A"}</span></p>
                  </div>
                </div>
              )}
            </div>

            {/* Sleek CRM Telemetry Activity Timeline */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b pb-2">{t("clientActivityTelemetry")}</h2>
              {logs.length > 0 ? (
                <div className="relative border-l border-zinc-200 dark:border-zinc-800 pl-4 space-y-6 py-2">
                  {logs.map((log) => {
                    const metadata = (log.metadata ?? {}) as Record<string, string | undefined>;
                    let icon = FileText;
                    let colorClass = "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
                    let title = log.action;
                    let desc = "";

                    if (log.action === "proposal_created") {
                      icon = FileText;
                      colorClass = "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400";
                      title = t("activityCreated");
                      desc = `Drafted by ${log.actorEmail || "Sales Rep"}`;
                    } else if (log.action === "proposal_sent") {
                      icon = Send;
                      colorClass = "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400";
                      title = t("activitySent");
                      desc = `Dispatched to ${proposal.client.email}`;
                    } else if (log.action === "proposal_viewed") {
                      icon = Eye;
                      colorClass = "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-900/40 dark:text-fuchsia-400";
                      title = t("activityOpened");
                      desc = `Client IP: ${log.ipAddress || "Unknown"}`;
                    } else if (log.action === "proposal_section_dwell") {
                      icon = Clock;
                      colorClass = "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400";
                      title = t("activityReviewed");
                      const dwell = Number(metadata.dwellTimeSeconds || 0);
                      const timeStr = dwell > 59 
                        ? `${Math.floor(dwell / 60)}m ${dwell % 60}s` 
                        : `${dwell}s`;
                      desc = `Read "${metadata.sectionTitle || "Scope"}" for ${timeStr}`;
                    } else if (log.action === "proposal_accepted") {
                      icon = CheckCircle2;
                      colorClass = "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400";
                      title = t("activitySigned");
                      desc = `Signed by ${metadata.acceptedByName || proposal.client.name}`;
                    } else if (log.action === "proposal_revision_requested") {
                      icon = XCircle;
                      colorClass = "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400";
                      title = t("activityRevisions");
                      desc = metadata.note ? `Note: "${metadata.note}"` : "Client requested structural edits";
                    }

                    const LogIcon = icon;

                    return (
                      <div key={log.id} className="relative group">
                        {/* Bullet Icon */}
                        <div className={`absolute -left-[26px] top-1 w-5 h-5 rounded-full flex items-center justify-center border border-white dark:border-zinc-900 ${colorClass}`}>
                          <LogIcon className="w-3 h-3" />
                        </div>
                        
                        {/* Event details */}
                        <div>
                          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{title}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{desc}</p>
                          <div className="flex gap-2 items-center mt-1 text-[9px] text-zinc-400 dark:text-zinc-500 font-medium">
                            <span>{format(new Date(log.createdAt), "MMM dd, hh:mm a")}</span>
                            {log.ipAddress && (
                              <>
                                <span>•</span>
                                <span className="font-mono">{log.ipAddress}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-zinc-400">
                  <p className="text-xs">{t("noActivityTracked")}</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
