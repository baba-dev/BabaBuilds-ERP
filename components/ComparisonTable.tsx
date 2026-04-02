"use client";

import { motion } from "framer-motion";
import { Check, X, Box, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    name: "Zero-Effort Retainers",
    baba: true,
    tally: false,
    quickbooks: "Partial",
    desc: "Auto-appends month names, dates, and dynamic content to recurring invoices without lifting a finger.",
  },
  {
    name: "AI Financial Advisor (BabaBot)",
    baba: true,
    tally: false,
    quickbooks: "Add-on",
    desc: "Natural language queries about your finances. 'How much did I spend on SEO last quarter?'",
  },
  {
    name: "Multi-Region Tax Compliance",
    baba: true,
    tally: "Regional",
    quickbooks: true,
    desc: "Global tax labels (VAT, GST, Sales Tax) and NIC/SAC code lookups baked in.",
  },
  {
    name: "Unified Proposal-to-Paid Workflow",
    baba: true,
    tally: false,
    quickbooks: true,
    desc: "Send a proposal, get it signed digitally, and convert to an invoice in 1 click.",
  },
  {
    name: "Self-Healing Bank Reconciliation",
    baba: true,
    tally: "Manual",
    quickbooks: true,
    desc: "AI matching of bank transactions with invoices and expenses.",
  },
];

export default function ComparisonTable() {
  return (
    <section id="comparison" className="py-24 bg-zinc-50 dark:bg-zinc-950/50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center space-y-4 mb-20">
          <h2 className="text-3xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
            Why <span className="text-indigo-600">BabaBuilds ERP?</span>
          </h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            Traditional software treats bookkeeping as a chore. We treat it as an automated superpower.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-6 px-4 font-bold text-lg text-zinc-900 dark:text-zinc-50">Feature</th>
                <th className="py-6 px-4 font-bold text-center text-lg bg-indigo-600/5 dark:bg-indigo-600/10 text-indigo-600">
                  <div className="flex flex-col items-center gap-1">
                    <Box className="w-6 h-6" />
                    <span>BabaERP</span>
                  </div>
                </th>
                <th className="py-6 px-4 font-bold text-center text-lg text-zinc-600 dark:text-zinc-400">Tally Prime</th>
                <th className="py-6 px-4 font-bold text-center text-lg text-zinc-600 dark:text-zinc-400">QuickBooks</th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature, idx) => (
                <motion.tr
                  key={feature.name}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="border-b border-zinc-100 dark:border-zinc-900 group"
                >
                  <td className="py-8 px-4">
                    <div className="space-y-1">
                      <p className="font-bold text-zinc-900 dark:text-zinc-100 text-lg">{feature.name}</p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-500 max-w-md">{feature.desc}</p>
                    </div>
                  </td>
                  <td className="py-8 px-4 text-center bg-indigo-600/5 dark:bg-indigo-600/10">
                    <div className="flex items-center justify-center">
                      <div className="bg-emerald-500/20 text-emerald-500 p-2 rounded-full">
                        <Check className="w-6 h-6 stroke-[3px]" />
                      </div>
                    </div>
                  </td>
                  <td className="py-8 px-4 text-center">
                    <div className="flex items-center justify-center">
                      {feature.tally === true ? (
                        <Check className="w-6 h-6 text-emerald-500/50" />
                      ) : feature.tally === false ? (
                        <X className="w-6 h-6 text-rose-500/50" />
                      ) : (
                        <span className="text-zinc-500 font-medium">{feature.tally}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-8 px-4 text-center">
                    <div className="flex items-center justify-center">
                      {feature.quickbooks === true ? (
                        <Check className="w-6 h-6 text-emerald-500/50" />
                      ) : feature.quickbooks === false ? (
                        <X className="w-6 h-6 text-rose-500/50" />
                      ) : (
                        <span className="text-zinc-500 font-medium">{feature.quickbooks}</span>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-12 p-6 bg-indigo-600/5 dark:bg-indigo-600/10 rounded-2xl border border-indigo-500/20 flex flex-col sm:flex-row items-center gap-6 justify-between animate-pulse-subtle">
           <div className="flex items-center gap-4">
              <Info className="w-8 h-8 text-indigo-600" />
              <p className="text-zinc-700 dark:text-zinc-300 font-medium">
                Switching is easy. We support <span className="text-indigo-600 font-bold">direct data import</span> from most legacy accounting tools.
              </p>
           </div>
           <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-600/20">
              Switch Today
           </button>
        </div>
      </div>
    </section>
  );
}
