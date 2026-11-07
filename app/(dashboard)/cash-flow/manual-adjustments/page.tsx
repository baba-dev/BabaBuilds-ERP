"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Plus, SlidersHorizontal, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CashFlowPageShell } from "../_components/cash-flow-page-shell";
import type { CashFlowScenarioTag, CashFlowHorizonType } from "../_components/types";
import { CashFlowActionBar } from "../_components/primitives/action-bar";
import { CashFlowHelp } from "../_components/primitives/help";
import { CashFlowErrorState, CashFlowState } from "../_components/primitives/state";
import { cashFlowIcon } from "../_components/primitives/styles";
import { buildCashFlowContextQuery, useCashFlowUrlContext, updateCashFlowContextInUrl } from "../_components/context";

type ManualAdjustment = {
  id: string;
  date: string;
  amount: number | string;
  direction: "INFLOW" | "OUTFLOW";
  reason: string;
  category: string | null;
  createdBy: string | null;
  createdAt: string;
};

function toIsoDateInput(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function asNumber(val: unknown) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

export default function CashFlowManualAdjustmentsPage() {
  const ctx = useCashFlowUrlContext();
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>(ctx.horizonType);
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>(ctx.scenarioTag);

  const [rows, setRows] = useState<ManualAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    date: toIsoDateInput(new Date()),
    direction: "OUTFLOW" as const,
    amount: "",
    category: "",
    reason: "",
  });

  const query = useMemo(() => buildCashFlowContextQuery({ horizonType, scenarioTag }), [horizonType, scenarioTag]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cash-flow/manual-adjustments", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) throw new Error((json as { error?: string } | null)?.error ?? "Failed to load manual adjustments");
      const data = ((json as { data?: unknown } | null)?.data ?? []) as ManualAdjustment[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Failed to load manual adjustments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
     
  }, []);

  const onCreate = async () => {
    setSaving(true);
    try {
      const payload = {
        date: new Date(`${draft.date}T00:00:00.000Z`).toISOString(),
        amount: asNumber(draft.amount),
        direction: draft.direction,
        reason: draft.reason.trim(),
        category: draft.category.trim() ? draft.category.trim() : null,
      };
      const res = await fetch("/api/cash-flow/manual-adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) throw new Error((json as { error?: string } | null)?.error ?? "Failed to create adjustment");

      toast.success("Manual adjustment created");
      setDraft((p) => ({ ...p, amount: "", category: "", reason: "" }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create adjustment");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (_id: string) => {
    // v1 API has no DELETE; keep UI ready but link to future work.
    toast.message("Delete will be added next", {
      description: "For now, manual adjustments can be overwritten by adding a reversal entry.",
    });
  };

  const totals = useMemo(() => {
    const inflow = rows.filter((r) => r.direction === "INFLOW").reduce((acc, r) => acc + asNumber(r.amount), 0);
    const outflow = rows.filter((r) => r.direction === "OUTFLOW").reduce((acc, r) => acc + asNumber(r.amount), 0);
    return { inflow, outflow, net: inflow - outflow };
  }, [rows]);

  return (
    <CashFlowPageShell
      title="Cash Flow · Manual adjustments"
      description="High-trust, auditable overrides for exceptional cash events."
      icon={<SlidersHorizontal className={`${cashFlowIcon.header} text-indigo-500/90`} />}
    >
      <div className="space-y-6">
        <CashFlowActionBar
          context={{ horizonType, scenarioTag }}
          onChange={(next) => {
            updateCashFlowContextInUrl(next);
            setHorizonType(next.horizonType);
            setScenarioTag(next.scenarioTag);
          }}
          loading={loading}
          extra={
            <Button size="sm" variant="outline" className="h-9 gap-2" asChild>
              <Link href={`/cash-flow/overview?${query}`}>
                Back to command center
              </Link>
            </Button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-black tracking-tight flex items-center justify-between">
                <span className="inline-flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  Create adjustment
                </span>
                <CashFlowHelp label="Manual adjustments">
                  Use this for one-off events not yet captured by invoices, POs, or bank data (e.g., deposits, refunds, exceptional payments).
                  Prefer reversals over deletes to preserve an audit trail.
                </CashFlowHelp>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={draft.date}
                    onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <Select value={draft.direction} onValueChange={(v) => setDraft((p) => ({ ...p, direction: v as typeof p.direction }))}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INFLOW">Inflow</SelectItem>
                      <SelectItem value="OUTFLOW">Outflow</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={draft.amount}
                    onChange={(e) => setDraft((p) => ({ ...p, amount: e.target.value }))}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input
                    placeholder="e.g. Deposit, Refund"
                    value={draft.category}
                    onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}
                    className="h-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={draft.reason}
                  onChange={(e) => setDraft((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Explain why this cash event exists and how it should be interpreted."
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={onCreate}
                  disabled={
                    saving ||
                    !draft.reason.trim() ||
                    !draft.date ||
                    !(asNumber(draft.amount) > 0)
                  }
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add adjustment
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setDraft({ date: toIsoDateInput(new Date()), direction: "OUTFLOW", amount: "", category: "", reason: "" })}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-black tracking-tight">Impact summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Total inflows</span>
                <span className="font-black tabular-nums text-emerald-700 dark:text-emerald-400">{totals.inflow.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Total outflows</span>
                <span className="font-black tabular-nums text-amber-700 dark:text-amber-400">{totals.outflow.toLocaleString()}</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/30 px-3 py-2">
                <span className="text-zinc-600 dark:text-zinc-300 font-semibold">Net</span>
                <span className="font-black tabular-nums">{totals.net.toLocaleString()}</span>
              </div>
              <p className="pt-2 text-xs text-zinc-500 dark:text-zinc-400">
                These entries feed the forecast engine as <span className="font-semibold">MANUAL</span> classification.
              </p>
            </CardContent>
          </Card>
        </div>

        {error ? (
          <CashFlowErrorState description={error} onRetry={() => void load()} />
        ) : loading ? (
          <div className="h-40 rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
        ) : rows.length === 0 ? (
          <CashFlowState
            icon="empty"
            title="No manual adjustments yet"
            description="Add one-off cash events here. Prefer reversals over deletes to preserve auditability."
            actions={
              <Button onClick={() => document.getElementById("manual-adjustments-top")?.scrollIntoView({ behavior: "smooth" })}>
                Add your first adjustment
              </Button>
            }
          />
        ) : (
          <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-black tracking-tight">Adjustment ledger</CardTitle>
            </CardHeader>
            <CardContent>
              <Table className="[&_th]:px-4 [&_td]:px-4">
                <TableHeader>
                  <TableRow className="bg-zinc-50/60 dark:bg-zinc-900/60">
                    <TableHead>Date</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows
                    .slice()
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((r) => (
                      <TableRow key={r.id} className="hover:bg-muted/50">
                        <TableCell className="text-sm font-semibold">
                          {format(new Date(r.date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className={r.direction === "INFLOW" ? "text-emerald-700 dark:text-emerald-400 font-semibold" : "text-amber-700 dark:text-amber-400 font-semibold"}>
                            {r.direction === "INFLOW" ? "Inflow" : "Outflow"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                          {r.category ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-zinc-700 dark:text-zinc-200">
                          <div className="line-clamp-2">{r.reason}</div>
                        </TableCell>
                        <TableCell className="text-right font-black tabular-nums">
                          {asNumber(r.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon-sm" variant="ghost" className="text-zinc-400 hover:text-rose-600" onClick={() => onDelete(r.id)} aria-label="Delete adjustment">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                Delete is not yet supported — add a reversal entry to negate an adjustment.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </CashFlowPageShell>
  );
}

