"use client";

import { useEffect, useMemo, useState } from "react";
import { Settings2, Save } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CashFlowNav } from "@/app/(dashboard)/cash-flow/_components/cash-flow-nav";
import type { CashFlowScenarioTag, CashFlowHorizonType } from "@/app/(dashboard)/cash-flow/_components/types";
import { listAssumptions, upsertAssumption } from "@/app/(dashboard)/cash-flow/_components/api";

const numeric = z.coerce.number().finite();

type AssumptionsForm = {
  defaultInvoicePaymentTermsDays: number;
  minimumCashThreshold: number;
  collectionsDelayDays: number;
  inflowHaircutPercent: number;
  outflowIncreasePercent: number;
  movePOEarlierLaterDays: number;
};

const defaultForm: AssumptionsForm = {
  defaultInvoicePaymentTermsDays: 15,
  minimumCashThreshold: 0,
  collectionsDelayDays: 0,
  inflowHaircutPercent: 0,
  outflowIncreasePercent: 0,
  movePOEarlierLaterDays: 0,
};

export default function CashFlowAssumptionsPage() {
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>("WEEKLY_13");
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>("BASE");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Array<{ key: string; valueJson: unknown }>>([]);
  const [form, setForm] = useState<AssumptionsForm>(defaultForm);

  const assumptionKey = useMemo(() => `cashForecast.scenario.${scenarioTag}`, [scenarioTag]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const data = await listAssumptions();
        setRows(data);
        const match = data.find((r: { key: string; valueJson: unknown }) => r.key === assumptionKey);
        const next = { ...defaultForm, ...(match?.valueJson ?? {}) };
        // best-effort sanitize
        setForm({
          defaultInvoicePaymentTermsDays: numeric.parse(next.defaultInvoicePaymentTermsDays ?? defaultForm.defaultInvoicePaymentTermsDays),
          minimumCashThreshold: numeric.parse(next.minimumCashThreshold ?? defaultForm.minimumCashThreshold),
          collectionsDelayDays: numeric.parse(next.collectionsDelayDays ?? defaultForm.collectionsDelayDays),
          inflowHaircutPercent: numeric.parse(next.inflowHaircutPercent ?? defaultForm.inflowHaircutPercent),
          outflowIncreasePercent: numeric.parse(next.outflowIncreasePercent ?? defaultForm.outflowIncreasePercent),
          movePOEarlierLaterDays: numeric.parse(next.movePOEarlierLaterDays ?? defaultForm.movePOEarlierLaterDays),
        });
      } catch (e) {
        toast.error("Failed to load assumptions");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [assumptionKey]);

  const onSave = async () => {
    setSaving(true);
    try {
      await upsertAssumption({ key: assumptionKey, valueJson: form, isActive: true });
      toast.success("Assumptions saved");
      const data = await listAssumptions();
      setRows(data);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save assumptions");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardPageShell
      title="Cash Flow Assumptions"
      description="Tune scenario knobs and default rules. Every forecast remains traceable."
      icon={<Settings2 className="h-5 w-5 text-indigo-500" />}
      secondaryActions={
        <div className="flex items-center gap-2">
          <Select value={horizonType} onValueChange={(v) => setHorizonType(v as CashFlowHorizonType)}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DAILY_30">30 days</SelectItem>
              <SelectItem value="WEEKLY_13">13 weeks</SelectItem>
              <SelectItem value="MONTHLY_12">12 months</SelectItem>
            </SelectContent>
          </Select>
          <Select value={scenarioTag} onValueChange={(v) => setScenarioTag(v as CashFlowScenarioTag)}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BASE">Base</SelectItem>
              <SelectItem value="BEST_CASE">Best case</SelectItem>
              <SelectItem value="WORST_CASE">Worst case</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={onSave} disabled={saving || loading} className="h-9">
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
        </div>
      }
      animated={false}
    >
      <CashFlowNav />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Scenario: {scenarioTag.replace("_", " ")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Default invoice payment terms (days)</Label>
                <Input
                  type="number"
                  value={form.defaultInvoicePaymentTermsDays}
                  onChange={(e) => setForm((p) => ({ ...p, defaultInvoicePaymentTermsDays: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum cash threshold</Label>
                <Input
                  type="number"
                  value={form.minimumCashThreshold}
                  onChange={(e) => setForm((p) => ({ ...p, minimumCashThreshold: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Collections delay (days)</Label>
                <Input
                  type="number"
                  value={form.collectionsDelayDays}
                  onChange={(e) => setForm((p) => ({ ...p, collectionsDelayDays: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Inflow haircut (%)</Label>
                <Input
                  type="number"
                  value={form.inflowHaircutPercent}
                  onChange={(e) => setForm((p) => ({ ...p, inflowHaircutPercent: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Outflow increase (%)</Label>
                <Input
                  type="number"
                  value={form.outflowIncreasePercent}
                  onChange={(e) => setForm((p) => ({ ...p, outflowIncreasePercent: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Move PO date (days)</Label>
                <Input
                  type="number"
                  value={form.movePOEarlierLaterDays}
                  onChange={(e) => setForm((p) => ({ ...p, movePOEarlierLaterDays: Number(e.target.value) }))}
                />
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              These values are stored as an assumption record keyed by <code className="font-mono">{assumptionKey}</code>.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saved assumptions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="text-sm text-zinc-500">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-zinc-500">No saved assumptions yet.</div>
            ) : (
              <div className="space-y-2">
                {rows.slice(0, 12).map((r) => (
                  <div key={r.key} className="rounded-lg border p-3">
                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">{r.key}</div>
                    <pre className="mt-2 text-[11px] text-zinc-500 overflow-auto max-h-28 bg-zinc-50 dark:bg-zinc-950/40 rounded p-2">
                      {JSON.stringify(r.valueJson, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardPageShell>
  );
}

