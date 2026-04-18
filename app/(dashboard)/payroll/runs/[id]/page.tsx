"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileBarChart2,
  Loader2,
  Settings2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PayrollRunDetailDto, PayrollRunStatusDto } from "@/lib/payroll/types";

type TransitionAction = "submit_review" | "approve" | "return_draft" | "return_review";

const RUN_STAGES: PayrollRunStatusDto[] = ["DRAFT", "REVIEW", "APPROVED", "POSTED"];

const STAGE_LABEL: Record<PayrollRunStatusDto, string> = {
  DRAFT: "Draft",
  REVIEW: "Review",
  APPROVED: "Approved",
  POSTED: "Posted",
};

function explainLines(line: PayrollRunDetailDto["lineItems"][0]): string[] {
  const log = line.calculationLog;
  if (log && typeof log === "object" && !Array.isArray(log) && "lines" in log) {
    const lines = (log as { lines?: unknown }).lines;
    if (Array.isArray(lines)) {
      return lines.filter((x): x is string => typeof x === "string");
    }
  }
  const breakdown = line.breakdownJson;
  if (breakdown && typeof breakdown === "object" && !Array.isArray(breakdown)) {
    return Object.entries(breakdown as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`);
  }
  return [
    `Earnings ${line.earnings} · Deductions ${line.deductions} · Employer ${line.employerCosts}`,
    `Net pay ${line.netPay} (${line.currency})`,
  ];
}

export default function PayrollRunCockpitPage() {
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<PayrollRunDetailDto | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadRun = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/runs/${params.id}`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Failed (${res.status})`);
      }
      const data = (await res.json()) as PayrollRunDetailDto;
      setRun(data);
      const first = data.lineItems[0]?.id;
      if (first) setExpanded({ [first]: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load run");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  const runTransition = async (action: TransitionAction) => {
    if (!params.id) return;
    setActionLoading(action);
    try {
      const res = await fetch(`/api/payroll/runs/${params.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        toast.error(data.error || "Transition failed");
        return;
      }
      toast.success("Run updated");
      await loadRun();
    } finally {
      setActionLoading(null);
    }
  };

  const postToLedger = async () => {
    if (!params.id) return;
    setActionLoading("post");
    try {
      const res = await fetch(`/api/payroll/runs/${params.id}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error || "Posting failed");
        return;
      }
      toast.success("Posted to ledger");
      await loadRun();
    } finally {
      setActionLoading(null);
    }
  };

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }),
    [],
  );

  const totals = useMemo(() => {
    if (!run) return { gross: 0, deductions: 0, net: 0, employer: 0 };
    return {
      gross: Number(run.totalEarnings),
      deductions: Number(run.totalDeductions),
      net: Number(run.totalNetPay),
      employer: Number(run.totalEmployerCosts),
    };
  }, [run]);

  const currentStage = run?.status ?? "DRAFT";
  const cap = run?.capabilities;
  const busy = actionLoading !== null;

  return (
    <DashboardPageShell
      title={run ? `Run cockpit · v${run.version}` : `Run cockpit · ${params.id}`}
      description="Review payroll line-level explainability, stage progression, and posting readiness."
      icon={<FileBarChart2 className="h-5 w-5 text-indigo-500" />}
      headerTone="transparent"
      primaryAction={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {cap?.canSubmitReview ? (
            <Button
              size="sm"
              className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
              disabled={busy}
              onClick={() => void runTransition("submit_review")}
            >
              {actionLoading === "submit_review" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit for review
            </Button>
          ) : null}
          {cap?.canReturnDraft ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void runTransition("return_draft")}>
              {actionLoading === "return_draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Return to draft
            </Button>
          ) : null}
          {cap?.canApprove ? (
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => void runTransition("approve")}>
              {actionLoading === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Approve
            </Button>
          ) : null}
          {cap?.canReturnReview ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void runTransition("return_review")}>
              {actionLoading === "return_review" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send back to review
            </Button>
          ) : null}
          {cap?.canPost ? (
            <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700" disabled={busy} onClick={() => void postToLedger()}>
              {actionLoading === "post" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Post to ledger
            </Button>
          ) : null}
        </div>
      }
      secondaryActions={
        <Button variant="outline" asChild>
          <Link href="/payroll/settings">Rules & settings</Link>
        </Button>
      }
    >
      <div className="space-y-6 pb-24">
        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-800 dark:text-rose-200">{error}</div>
        ) : null}

        <section className="rounded-3xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-900/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Stage rail</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">Draft → Review → Approved → Posted</h2>
              {run ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Period {new Date(run.period.startDate).toLocaleDateString()} – {new Date(run.period.endDate).toLocaleDateString()}
                </p>
              ) : null}
            </div>
            <Badge className="rounded-full bg-indigo-500/10 px-3 py-1.5 text-indigo-700 dark:text-indigo-300">
              Current: {STAGE_LABEL[currentStage]}
            </Badge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {RUN_STAGES.map((stage, index) => {
              const currentIdx = RUN_STAGES.indexOf(currentStage);
              const isDone = index < currentIdx;
              const isActive = index === currentIdx;

              return (
                <div
                  key={stage}
                  className={cn(
                    "relative rounded-2xl border p-4",
                    isDone && "border-emerald-300/70 bg-emerald-500/5",
                    isActive && "border-indigo-300/80 bg-indigo-500/10",
                    !isDone && !isActive && "border-zinc-200/70 bg-zinc-500/5 dark:border-zinc-700/70",
                  )}
                >
                  <p className="text-xs uppercase tracking-[0.15em] text-zinc-500">Stage {index + 1}</p>
                  <p className="mt-2 text-sm font-semibold">{STAGE_LABEL[stage]}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {isDone ? "Completed" : isActive ? "In progress" : "Blocked by previous stage"}
                  </p>
                </div>
              );
            })}
          </div>
          {run?.posting ? (
            <p className="mt-3 text-xs text-zinc-500">
              Posting: {run.posting.postingStatus}
              {run.posting.errorMessage ? ` — ${run.posting.errorMessage}` : ""}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-zinc-200/70 bg-white/80 dark:border-zinc-800/70 dark:bg-zinc-900/30">
          <div className="flex items-center justify-between border-b border-zinc-200/60 p-4 dark:border-zinc-800">
            <div>
              <h3 className="text-base font-semibold tracking-tight">Employee payroll lines</h3>
              <p className="text-sm text-zinc-500">Open each drawer to answer “Why this amount?” for approvals.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1" disabled>
                <ClipboardList className="h-3.5 w-3.5" />
                Export
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/payroll/settings">
                  <Settings2 className="mr-1 h-3.5 w-3.5" />
                  Edit rules
                </Link>
              </Button>
            </div>
          </div>

          <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {loading ? (
              <div className="p-10 text-center text-sm text-zinc-500">Loading run…</div>
            ) : !run?.lineItems.length ? (
              <div className="p-10 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-zinc-300" />
                <p className="mt-3 text-sm text-zinc-500">No line items for this run.</p>
              </div>
            ) : (
              run.lineItems.map((row) => {
                const isOpen = expanded[row.id] ?? false;
                const name = `${row.employee.firstName} ${row.employee.lastName}`.trim();
                const role = row.employee.designation || row.employee.departmentName || "—";

                return (
                  <div key={row.id} className="p-4">
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => ({ ...prev, [row.id]: !isOpen }))}
                      className="flex w-full items-center justify-between gap-2 rounded-xl p-2 text-left hover:bg-zinc-100/70 dark:hover:bg-zinc-800/40"
                    >
                      <div>
                        <p className="text-sm font-semibold">{name}</p>
                        <p className="text-xs text-zinc-500">{role}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="text-sm font-semibold tabular-nums">{fmt.format(Number(row.netPay))}</p>
                        {isOpen ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="mt-3 rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Earnings</p>
                            <p className="mt-1 text-sm font-semibold tabular-nums">{fmt.format(Number(row.earnings))}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Deductions</p>
                            <p className="mt-1 text-sm font-semibold tabular-nums">{fmt.format(Number(row.deductions))}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Net</p>
                            <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                              {fmt.format(Number(row.netPay))}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">Why this amount?</p>
                          {explainLines(row).map((note) => (
                            <p key={note} className="text-sm text-zinc-600 dark:text-zinc-300">
                              • {note}
                            </p>
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
            <SummaryCell label="Employer cost" value={fmt.format(totals.employer)} />
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
      <p className={cn("mt-1 text-base font-semibold tabular-nums", tone === "positive" && "text-emerald-700 dark:text-emerald-300")}>
        {value}
      </p>
    </div>
  );
}
