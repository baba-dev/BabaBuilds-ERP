"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronDown, ChevronRight, ClipboardList, FileBarChart2, Settings2, Sparkles } from "lucide-react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PayrollLine = {
  id: string;
  employee: string;
  role: string;
  gross: number;
  deductions: number;
  net: number;
  overtimeHours: number;
  notes: string[];
};

const runStages = ["Draft", "Review", "Approved", "Posted"] as const;
const currentStage = "Review" as const;

const payrollLines: PayrollLine[] = [
  { id: "e-1001", employee: "Ava Martinez", role: "Senior Designer", gross: 4600, deductions: 1180, net: 3420, overtimeHours: 3, notes: ["Base salary prorated for 15 days.", "3h overtime at 1.5x policy multiplier.", "Dental + PF deduction applied."] },
  { id: "e-1002", employee: "Noah Patel", role: "Frontend Engineer", gross: 5200, deductions: 1310, net: 3890, overtimeHours: 1, notes: ["Base fixed monthly component.", "Meal allowance included (+$120).", "Federal withholding recalculated from W-4 update."] },
  { id: "e-1003", employee: "Mia Johnson", role: "Operations Lead", gross: 4900, deductions: 1210, net: 3690, overtimeHours: 0, notes: ["No overtime this period.", "Loan recovery installment deducted (-$190).", "State tax true-up included."] },
];

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function PayrollRunCockpitPage() {
  const params = useParams<{ id: string }>();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [payrollLines[0]!.id]: true });

  const totals = useMemo(() => {
    const gross = payrollLines.reduce((sum, row) => sum + row.gross, 0);
    const deductions = payrollLines.reduce((sum, row) => sum + row.deductions, 0);
    const net = payrollLines.reduce((sum, row) => sum + row.net, 0);
    const employerCost = gross * 0.12;
    return { gross, deductions, net, employerCost };
  }, []);

  return (
    <DashboardPageShell
      title={`Run cockpit · ${params.id}`}
      description="Review payroll line-level explainability, stage progression, and posting readiness."
      icon={<FileBarChart2 className="h-5 w-5 text-indigo-500" />}
      headerTone="transparent"
      primaryAction={<Button>Advance to Approved</Button>}
      secondaryActions={<Button variant="outline" asChild><Link href="/payroll/settings">Rules & settings</Link></Button>}
    >
      <div className="space-y-6 pb-24">
        <section className="rounded-3xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-900/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Stage rail</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">Draft → Review → Approved → Posted</h2>
            </div>
            <Badge className="rounded-full bg-indigo-500/10 px-3 py-1.5 text-indigo-700 dark:text-indigo-300">Current: {currentStage}</Badge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {runStages.map((stage, index) => {
              const currentIdx = runStages.indexOf(currentStage);
              const isDone = index < currentIdx;
              const isActive = index === currentIdx;

              return (
                <div key={stage} className={cn(
                  "relative rounded-2xl border p-4",
                  isDone && "border-emerald-300/70 bg-emerald-500/5",
                  isActive && "border-indigo-300/80 bg-indigo-500/10",
                  !isDone && !isActive && "border-zinc-200/70 bg-zinc-500/5 dark:border-zinc-700/70",
                )}>
                  <p className="text-xs uppercase tracking-[0.15em] text-zinc-500">Stage {index + 1}</p>
                  <p className="mt-2 text-sm font-semibold">{stage}</p>
                  <p className="mt-1 text-xs text-zinc-500">{isDone ? "Completed" : isActive ? "In progress" : "Blocked by previous stage"}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200/70 bg-white/80 dark:border-zinc-800/70 dark:bg-zinc-900/30">
          <div className="flex items-center justify-between border-b border-zinc-200/60 p-4 dark:border-zinc-800">
            <div>
              <h3 className="text-base font-semibold tracking-tight">Employee payroll lines</h3>
              <p className="text-sm text-zinc-500">Open each drawer to answer “Why this amount?” for approvals.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1"><ClipboardList className="h-3.5 w-3.5" />Export review notes</Button>
              <Button size="sm" variant="outline" asChild><Link href="/payroll/settings"><Settings2 className="mr-1 h-3.5 w-3.5" />Edit rules</Link></Button>
            </div>
          </div>

          <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {payrollLines.length === 0 ? (
              <div className="p-10 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-zinc-300" />
                <p className="mt-3 text-sm text-zinc-500">No employees are assigned to this run yet.</p>
              </div>
            ) : (
              payrollLines.map((row) => {
                const isOpen = expanded[row.id] ?? false;

                return (
                  <div key={row.id} className="p-4">
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => ({ ...prev, [row.id]: !isOpen }))}
                      className="flex w-full items-center justify-between gap-2 rounded-xl p-2 text-left hover:bg-zinc-100/70 dark:hover:bg-zinc-800/40"
                    >
                      <div>
                        <p className="text-sm font-semibold">{row.employee}</p>
                        <p className="text-xs text-zinc-500">{row.role} · Overtime {row.overtimeHours}h</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="text-sm font-semibold tabular-nums">{fmt.format(row.net)}</p>
                        {isOpen ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="mt-3 rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Gross</p>
                            <p className="mt-1 text-sm font-semibold tabular-nums">{fmt.format(row.gross)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Deductions</p>
                            <p className="mt-1 text-sm font-semibold tabular-nums">{fmt.format(row.deductions)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Net</p>
                            <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{fmt.format(row.net)}</p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">Why this amount?</p>
                          {row.notes.map((note) => (
                            <p key={note} className="text-sm text-zinc-600 dark:text-zinc-300">• {note}</p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <div className="sticky bottom-4 z-30 rounded-2xl border border-zinc-200/80 bg-white/90 p-4 shadow-lg backdrop-blur dark:border-zinc-700/80 dark:bg-zinc-900/90">
          <div className="grid gap-3 sm:grid-cols-4">
            <SummaryCell label="Gross" value={fmt.format(totals.gross)} />
            <SummaryCell label="Deductions" value={fmt.format(totals.deductions)} />
            <SummaryCell label="Net pay" value={fmt.format(totals.net)} tone="positive" />
            <SummaryCell label="Employer cost" value={fmt.format(totals.employerCost)} />
          </div>
        </div>
      </div>
    </DashboardPageShell>
  );
}

function SummaryCell({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "positive" }) {
  return (
    <div className="rounded-xl border border-zinc-200/70 bg-white/80 p-3 text-center dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className={cn("mt-1 text-base font-semibold tabular-nums", tone === "positive" && "text-emerald-700 dark:text-emerald-300")}>{value}</p>
    </div>
  );
}
