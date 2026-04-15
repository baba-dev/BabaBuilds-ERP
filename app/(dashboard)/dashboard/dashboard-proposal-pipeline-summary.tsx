import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import { DollarSign, AlertTriangle, TrendingUp, ChevronRight } from "lucide-react";
import { PipelineSummary } from "@/lib/commercial-workflow/pipeline";

interface DashboardProposalPipelineProps {
  summary: PipelineSummary;
}

export function DashboardProposalPipelineSummary({ summary }: DashboardProposalPipelineProps) {
  const formatMoney = (amount: number) => formatCurrency(amount, "INR", "en-IN");

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm flex flex-col h-full">
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/50">
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-500" /> Revenue Operations
        </h2>
        <Link href="/proposals/pipeline" className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 uppercase tracking-widest">
          Pipeline <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      
      <div className="p-5 flex-1 flex flex-col gap-4">
        {/* Metric 1 */}
        <div className="flex justify-between items-center p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded bg-emerald-100 text-emerald-600 flex items-center justify-center">
               <DollarSign className="w-4 h-4" />
             </div>
             <div>
               <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Awaiting Invoice</p>
               <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Accepted Proposals</p>
             </div>
          </div>
          <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">{formatMoney(summary.acceptedNotConvertedValue)}</p>
        </div>

        {/* Metric 2 */}
        <div className="flex justify-between items-center p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded bg-amber-100 text-amber-600 flex items-center justify-center">
               <AlertTriangle className="w-4 h-4" />
             </div>
             <div>
               <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Converted Unpaid</p>
               <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Missing Cashflow</p>
             </div>
          </div>
          <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">{formatMoney(summary.convertedUnpaidValue)}</p>
        </div>

        {/* CTA */}
        {summary.stalledCount > 0 ? (
          <Link href="/proposals/pipeline?filter=stalled" className="mt-auto group bg-rose-50 hover:bg-rose-100 border border-rose-100 transition-colors rounded-lg p-3 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-rose-700">🚨 {summary.stalledCount} Stalled Items</p>
              <p className="text-[10px] text-rose-600/80 uppercase tracking-widest mt-0.5 font-medium">{formatMoney(summary.stalledValue)} at risk</p>
            </div>
            <ChevronRight className="w-4 h-4 text-rose-500 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        ) : (
          <div className="mt-auto bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-emerald-700">✨ Healthy Pipeline</p>
            <p className="text-[10px] text-emerald-600/80 uppercase tracking-widest mt-0.5">No stalled proposals detected</p>
          </div>
        )}
      </div>
    </div>
  );
}
