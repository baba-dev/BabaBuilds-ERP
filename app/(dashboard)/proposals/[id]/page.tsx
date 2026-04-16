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
  convertProposalToServiceOrderFormAction,
} from "./actions";
import { getTranslations } from "next-intl/server";

export default async function ProposalDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.workspaceId) redirect("/login");

  const t = await getTranslations("ProposalDetail");

  const serviceTemplates = await prisma.serviceTemplate.findMany({
    where: { workspaceId: session.workspaceId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const proposal = await prisma.proposal.findUnique({
    where: { 
      id: params.id,
      workspaceId: session.workspaceId 
    },
    include: {
      client: true,
      items: true,
      conversions: {
        include: { invoice: true, retainer: true, serviceOrder: true }
      },
      generatedInvoices: true,
      generatedRetainers: true
    }
  });

  if (!proposal) redirect("/proposals");

  const formatMoney = (amount: any) => formatCurrency(Number(amount), "INR", "en-IN");

  const TimelineItem = ({ active, icon: Icon, title, date, subtitle }: any) => (
    <div className={`flex flex-col items-center gap-2 \${active ? 'text-indigo-600' : 'text-zinc-400 opacity-50'}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center \${active ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest">{title}</p>
        {active && date && <p className="text-[10px] text-zinc-500 mt-1">{format(new Date(date), "MMM dd, hh:mm a")}</p>}
        {subtitle && <p className="text-[10px] text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
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
              <Building2 className="w-4 h-4" /> {t("preparedFor", { name: proposal.client.name })}
            </div>
          </div>
          <div className="text-right">
             <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("value")}</p>
             <p className="text-2xl font-black text-indigo-600">{formatMoney(proposal.totalAmount)}</p>
          </div>
        </div>

        {/* Timeline Surface */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-8 border-b pb-2">{t("timeline.title")}</h2>
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

            {proposal.firstConvertedAt && proposal.generatedInvoices.length > 0 && proposal.generatedInvoices.every((i: any) => i.status === 'PAID' || i.status === 'Paid') && (
              <TimelineItem active={true} icon={CheckCircle2} title={t("timeline.reconciled")} date={proposal.generatedInvoices[0].dateReceived ?? proposal.generatedInvoices[0].createdAt} subtitle={t("timeline.revenueSecured")} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b pb-2">{t("artifacts.title")}</h2>
              {proposal.firstConvertedAt ? (
                 <div className="space-y-4">
                   {proposal.conversions.map((conv: any) => (
                      <div key={conv.id} className="p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-950 space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <Receipt className="text-indigo-500 w-5 h-5"/>
                            <div>
                              <p className="font-bold text-sm">
                                {conv.invoice
                                  ? t("artifacts.invoiceLabel", { invoiceNumber: conv.invoice.invoiceNumber })
                                  : conv.retainer
                                    ? t("artifacts.retainerLabel")
                                    : conv.serviceOrder
                                      ? t("artifacts.serviceOrderLabel")
                                      : t("artifacts.conversionLabel")}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {conv.invoice ? formatMoney(conv.invoice.totalAmount) : conv.retainer ? formatMoney(conv.retainer.amount) : conv.serviceOrder ? formatMoney(conv.serviceOrder.totalAmount ?? 0) : ""}
                              </p>
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-zinc-200 text-xs font-bold rounded">
                            {conv.invoice?.status || conv.retainer?.status || conv.serviceOrder?.status || conv.conversionType}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {conv.invoice && (
                            <Link href={`/income?search=${encodeURIComponent(conv.invoice.invoiceNumber)}`} className="text-indigo-600 font-bold hover:underline">
                              {t("artifacts.openInvoice")}
                            </Link>
                          )}
                          {conv.retainer && (
                            <Link href={`/retainers`} className="text-indigo-600 font-bold hover:underline">
                              {t("artifacts.openRetainers")}
                            </Link>
                          )}
                        </div>
                      </div>
                   ))}
                   {proposal.conversions.length === 0 && <p className="text-sm text-zinc-500">{t("artifacts.noneFound")}</p>}
                 </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-zinc-400">
                  <p className="text-sm font-medium">{t("artifacts.noneYet")}</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="space-y-6">
            {proposal.status === "ACCEPTED" && !proposal.firstConvertedAt && (
              <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-6 text-center shadow-sm">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <h3 className="font-bold text-emerald-900 dark:text-emerald-400 mb-1">{t("conversion.readyTitle")}</h3>
                <p className="text-xs text-emerald-700/80 mb-4 tracking-wide leading-relaxed">{t("conversion.readySubtitle")}</p>

                <div className="space-y-2">
                  <form action={convertProposalToInvoiceFormAction}>
                    <input type="hidden" name="proposalId" value={proposal.id} />
                    <button
                      type="submit"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold tracking-widest uppercase text-xs h-10 rounded shadow-md transition-all"
                    >
                      {t("conversion.convertToInvoice")}
                    </button>
                  </form>

                  <form action={convertProposalToRetainerFormAction} className="space-y-2">
                    <input type="hidden" name="proposalId" value={proposal.id} />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        name="amount"
                        placeholder={t("conversion.retainerAmountPlaceholder")}
                        className="h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-emerald-800/40 dark:bg-zinc-950 dark:text-zinc-50"
                        defaultValue={String(Number(proposal.totalAmount ?? 0) || "")}
                        inputMode="decimal"
                      />
                      <select
                        name="frequency"
                        defaultValue="MONTHLY"
                        className="h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-emerald-800/40 dark:bg-zinc-950 dark:text-zinc-50"
                      >
                        <option value="MONTHLY">{t("conversion.frequencyMonthly")}</option>
                        <option value="QUARTERLY">{t("conversion.frequencyQuarterly")}</option>
                        <option value="ANNUALLY">{t("conversion.frequencyAnnually")}</option>
                      </select>
                    </div>
                    <input
                      name="serviceName"
                      placeholder={t("conversion.retainerServiceNamePlaceholder")}
                      className="h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-emerald-800/40 dark:bg-zinc-950 dark:text-zinc-50"
                      defaultValue={proposal.title}
                    />
                    <button
                      type="submit"
                      className="w-full bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 font-bold tracking-widest uppercase text-xs h-10 rounded shadow-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all"
                    >
                      {t("conversion.convertToRetainer")}
                    </button>
                  </form>

                  <form action={convertProposalToServiceOrderFormAction} className="space-y-2">
                    <input type="hidden" name="proposalId" value={proposal.id} />
                    <select
                      name="serviceTemplateId"
                      className="h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-emerald-800/40 dark:bg-zinc-950 dark:text-zinc-50"
                      defaultValue={serviceTemplates[0]?.id || ""}
                    >
                      {serviceTemplates.length === 0 ? (
                        <option value="">{t("conversion.noServiceTemplates")}</option>
                      ) : (
                        serviceTemplates.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))
                      )}
                    </select>
                    <input
                      name="buyerEmail"
                      placeholder={t("conversion.buyerEmailPlaceholder")}
                      className="h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-emerald-800/40 dark:bg-zinc-950 dark:text-zinc-50"
                      defaultValue={proposal.client.email || ""}
                    />
                    <textarea
                      name="buyerNote"
                      placeholder={t("conversion.buyerNotePlaceholder")}
                      className="min-h-[72px] rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-emerald-800/40 dark:bg-zinc-950 dark:text-zinc-50"
                    />
                    <button
                      type="submit"
                      disabled={serviceTemplates.length === 0}
                      className="w-full bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 font-bold tracking-widest uppercase text-xs h-10 rounded shadow-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all"
                    >
                      {t("conversion.convertToServiceOrder")}
                    </button>
                  </form>
                </div>
              </div>
            )}
            
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b pb-2">{t("client.title")}</h2>
              <p className="font-bold">{proposal.client.name}</p>
              <p className="text-sm text-zinc-500">{proposal.client.email || t("client.noEmail")}</p>
              
              <div className="mt-6 pt-4 border-t border-zinc-100">
                 <p className="text-xs text-zinc-500 font-medium">{t("client.publicUrl")}</p>
                 <a href={`/p/\${proposal.publicToken}`} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 mt-1 block truncate hover:underline">
                   {`/p/\${proposal.publicToken}`}
                 </a>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
