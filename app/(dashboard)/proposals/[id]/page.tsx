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

export default async function ProposalDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.workspaceId) redirect("/login");

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
                ← Back
              </Link>
              <span className="text-xs font-bold px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded">{proposal.proposalNo}</span>
              <span className="text-xs font-bold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded">{proposal.status}</span>
            </div>
            <h1 className="text-3xl font-black">{proposal.title}</h1>
            <div className="flex items-center gap-2 text-zinc-500 mt-2 text-sm font-medium">
              <Building2 className="w-4 h-4" /> Prepared for {proposal.client.name}
            </div>
          </div>
          <div className="text-right">
             <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Value</p>
             <p className="text-2xl font-black text-indigo-600">{formatMoney(proposal.totalAmount)}</p>
          </div>
        </div>

        {/* Timeline Surface */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-8 border-b pb-2">Lifecycle Timeline</h2>
          <div className="flex justify-between relative px-4">
            
            <div className="absolute top-5 left-10 right-10 h-0.5 bg-zinc-200 dark:bg-zinc-800 -z-10" />
            <div 
              className="absolute top-5 left-10 h-0.5 bg-indigo-500 -z-10 transition-all" 
              style={{ width: proposal.firstConvertedAt ? '100%' : proposal.acceptedAt ? '75%' : proposal.firstViewedAt ? '50%' : proposal.sentAt ? '25%' : '0%' }}
            />

            <TimelineItem active={true} icon={FileText} title="Drafted" date={proposal.dateCreated} />
            <TimelineItem active={!!proposal.sentAt} icon={Send} title="Sent" date={proposal.sentAt} />
            <TimelineItem active={!!proposal.firstViewedAt} icon={Eye} title="Viewed" date={proposal.lastViewedAt} subtitle={`\${proposal.viewCount} views`} />
            
            {proposal.declinedAt ? (
               <TimelineItem active={true} icon={XCircle} title="Requested Changes" date={proposal.declinedAt} />
            ) : (
               <TimelineItem active={!!proposal.acceptedAt} icon={CheckCircle2} title="Accepted" date={proposal.acceptedAt} subtitle={proposal.acceptedByName} />
            )}

            <TimelineItem active={!!proposal.firstConvertedAt} icon={DollarSign} title="Converted" date={proposal.firstConvertedAt} />

            {proposal.firstConvertedAt && proposal.generatedInvoices.length > 0 && proposal.generatedInvoices.every((i: any) => i.status === 'PAID' || i.status === 'Paid') && (
              <TimelineItem active={true} icon={CheckCircle2} title="Reconciled" date={proposal.generatedInvoices[0].updatedAt} subtitle="Revenue secured" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b pb-2">Downstream Conversion Artifacts</h2>
              {proposal.firstConvertedAt ? (
                 <div className="space-y-4">
                   {proposal.generatedInvoices.map((inv: any) => (
                      <div key={inv.id} className="p-4 border rounded-lg flex justify-between items-center bg-zinc-50 dark:bg-zinc-950">
                        <div className="flex items-center gap-3">
                          <Receipt className="text-indigo-500 w-5 h-5"/>
                          <div>
                            <p className="font-bold text-sm">Invoice {inv.invoiceNumber}</p>
                            <p className="text-xs text-zinc-500">{formatMoney(inv.totalAmount)}</p>
                          </div>
                        </div>
                        <span className="px-2 py-1 bg-zinc-200 text-xs font-bold rounded">{inv.status}</span>
                      </div>
                   ))}
                   {proposal.generatedInvoices.length === 0 && <p className="text-sm text-zinc-500">Converted via Retainer/Order only.</p>}
                 </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-zinc-400">
                  <p className="text-sm font-medium">No downstream artifacts yet.</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="space-y-6">
            {proposal.status === "ACCEPTED" && !proposal.firstConvertedAt && (
              <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-6 text-center shadow-sm">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <h3 className="font-bold text-emerald-900 dark:text-emerald-400 mb-1">Ready for Conversion</h3>
                <p className="text-xs text-emerald-700/80 mb-4 tracking-wide leading-relaxed">This proposal was accepted. Convert it into a live revenue artifact.</p>
                
                {/* Note: In a complete implementation, this button would trigger ConversionWizard.tsx */}
                <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold tracking-widest uppercase text-xs h-10 rounded shadow-md transition-all">
                  Convert Workspace
                </button>
              </div>
            )}
            
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b pb-2">Client Details</h2>
              <p className="font-bold">{proposal.client.name}</p>
              <p className="text-sm text-zinc-500">{proposal.client.email || 'No email'}</p>
              
              <div className="mt-6 pt-4 border-t border-zinc-100">
                 <p className="text-xs text-zinc-500 font-medium">Public URL</p>
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
