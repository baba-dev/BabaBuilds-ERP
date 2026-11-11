"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Settings2, Save, RotateCcw, Wand2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { CashFlowPageShell } from "@/app/(dashboard)/cash-flow/_components/cash-flow-page-shell";
import type { CashFlowScenarioTag, CashFlowHorizonType } from "@/app/(dashboard)/cash-flow/_components/types";
import { listAssumptions, upsertAssumption } from "@/app/(dashboard)/cash-flow/_components/api";
import { CashFlowHelp } from "../_components/primitives/help";
import { cashFlowIcon } from "../_components/primitives/styles";
import { buildCashFlowContextQuery, getCashFlowContextFromSearchParams, updateCashFlowContextInUrl } from "../_components/context";

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
  defaultInvoicePaymentTermsDays: 30,
  minimumCashThreshold: 0,
  collectionsDelayDays: 0,
  inflowHaircutPercent: 0,
  outflowIncreasePercent: 0,
  movePOEarlierLaterDays: 0,
};

const scenarioDefaults: Record<CashFlowScenarioTag, AssumptionsForm> = {
  BASE: {
    defaultInvoicePaymentTermsDays: 30,
    minimumCashThreshold: 0,
    collectionsDelayDays: 0,
    inflowHaircutPercent: 0,
    outflowIncreasePercent: 0,
    movePOEarlierLaterDays: 0,
  },
  BEST_CASE: {
    defaultInvoicePaymentTermsDays: 30,
    minimumCashThreshold: 0,
    collectionsDelayDays: -3,
    inflowHaircutPercent: 0,
    outflowIncreasePercent: -2,
    movePOEarlierLaterDays: 3,
  },
  WORST_CASE: {
    defaultInvoicePaymentTermsDays: 30,
    minimumCashThreshold: 0,
    collectionsDelayDays: 10,
    inflowHaircutPercent: 8,
    outflowIncreasePercent: 10,
    movePOEarlierLaterDays: -7,
  },
};

const curatedPresets: Array<{
  id: string;
  label: string;
  description: string;
  tone: "default" | "warning" | "positive";
  apply: (base: AssumptionsForm) => AssumptionsForm;
}> = [
  {
    id: "engine-default",
    label: "Engine default",
    description: "Reset to the scenario’s built-in baseline defaults.",
    tone: "default",
    apply: () => ({ ...scenarioDefaults.BASE }),
  },
  {
    id: "conservative",
    label: "Conservative",
    description: "Assume slower collections + higher outflows to stress-test runway.",
    tone: "warning",
    apply: (base) => ({
      ...base,
      collectionsDelayDays: Math.max(0, base.collectionsDelayDays + 7),
      inflowHaircutPercent: Math.max(base.inflowHaircutPercent, 5),
      outflowIncreasePercent: Math.max(base.outflowIncreasePercent, 8),
    }),
  },
  {
    id: "collections-push",
    label: "Collections push",
    description: "Assume faster receipts (good for “best case” planning).",
    tone: "positive",
    apply: (base) => ({
      ...base,
      collectionsDelayDays: Math.min(0, base.collectionsDelayDays - 3),
      inflowHaircutPercent: Math.max(0, Math.min(base.inflowHaircutPercent, 2)),
    }),
  },
];

const formSections: Array<{
  key: string;
  title: string;
  description: string;
  fields: Array<{
    key: keyof AssumptionsForm;
    label: string;
    help: string;
    unit?: string;
    step?: number;
  }>;
}> = [
  {
    key: "collections",
    title: "Collections behavior",
    description: "How quickly customers pay and how conservative you want inflow timing to be.",
    fields: [
      {
        key: "defaultInvoicePaymentTermsDays",
        label: "Default invoice payment terms",
        help: "Used when invoices do not specify terms. This influences expected receipt dates.",
        unit: "days",
        step: 1,
      },
      {
        key: "collectionsDelayDays",
        label: "Collections delay",
        help: "Adds a uniform delay to expected receipt dates to reflect typical late payments.",
        unit: "days",
        step: 1,
      },
      {
        key: "inflowHaircutPercent",
        label: "Inflow haircut",
        help: "Conservatism factor applied to non-actual inflows (expected/predicted). Use to reflect churn or non-collection risk.",
        unit: "%",
        step: 1,
      },
    ],
  },
  {
    key: "safety",
    title: "Safety buffer",
    description: "Your minimum cash comfort level used for alerts and runway interpretation.",
    fields: [
      {
        key: "minimumCashThreshold",
        label: "Minimum cash threshold",
        help: "Alerts and interpretation use this as the buffer floor. If your forecast dips near this, you’ll see stronger warnings.",
        step: 1,
      },
    ],
  },
  {
    key: "commitments",
    title: "Commitments stress & timing",
    description: "Model spend stress and timing shifts for purchase orders and commitments.",
    fields: [
      {
        key: "outflowIncreasePercent",
        label: "Outflow increase",
        help: "Applies a stress multiplier to projected outflows for scenario modeling.",
        unit: "%",
        step: 1,
      },
      {
        key: "movePOEarlierLaterDays",
        label: "Move PO timing",
        help: "Shifts expected PO timing earlier or later (negative moves earlier, positive moves later).",
        unit: "days",
        step: 1,
      },
    ],
  },
];

export default function CashFlowAssumptionsPage() {
  const search = useSearchParams();
  const urlCtx = useMemo(() => getCashFlowContextFromSearchParams(search), [search]);
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>(urlCtx.horizonType);
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>(urlCtx.scenarioTag);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Array<{ key: string; valueJson: unknown }>>([]);
  const [form, setForm] = useState<AssumptionsForm>(defaultForm);
  const [loadedForm, setLoadedForm] = useState<AssumptionsForm>(defaultForm);

  const assumptionKey = useMemo(() => `cashForecast.scenario.${scenarioTag}`, [scenarioTag]);

  useEffect(() => {
    setHorizonType(urlCtx.horizonType);
    setScenarioTag(urlCtx.scenarioTag);
  }, [urlCtx.horizonType, urlCtx.scenarioTag]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const data = await listAssumptions();
        setRows(data);
        const match = data.find((r: { key: string; valueJson: unknown }) => r.key === assumptionKey);
        const base = scenarioDefaults[scenarioTag] ?? defaultForm;
        const next = { ...base, ...(match?.valueJson ?? {}) };
        // best-effort sanitize
        const sanitized = {
          defaultInvoicePaymentTermsDays: numeric.parse(next.defaultInvoicePaymentTermsDays ?? defaultForm.defaultInvoicePaymentTermsDays),
          minimumCashThreshold: numeric.parse(next.minimumCashThreshold ?? defaultForm.minimumCashThreshold),
          collectionsDelayDays: numeric.parse(next.collectionsDelayDays ?? defaultForm.collectionsDelayDays),
          inflowHaircutPercent: numeric.parse(next.inflowHaircutPercent ?? defaultForm.inflowHaircutPercent),
          outflowIncreasePercent: numeric.parse(next.outflowIncreasePercent ?? defaultForm.outflowIncreasePercent),
          movePOEarlierLaterDays: numeric.parse(next.movePOEarlierLaterDays ?? defaultForm.movePOEarlierLaterDays),
        } satisfies AssumptionsForm;
        setForm(sanitized);
        setLoadedForm(sanitized);
      } catch {
        toast.error("Failed to load assumptions");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [assumptionKey, scenarioTag]);

  const onSave = async () => {
    setSaving(true);
    try {
      await upsertAssumption({ key: assumptionKey, valueJson: form, isActive: true });
      toast.success("Assumptions saved");
      const data = await listAssumptions();
      setRows(data);
      setLoadedForm(form);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save assumptions");
    } finally {
      setSaving(false);
    }
  };

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(loadedForm), [form, loadedForm]);

  const resetAll = () => setForm(scenarioDefaults[scenarioTag] ?? defaultForm);
  const resetToLoaded = () => setForm(loadedForm);

  const resetSection = (sectionKey: string) => {
    const section = formSections.find((s) => s.key === sectionKey);
    if (!section) return;
    setForm((prev) => {
      const next = { ...prev };
      for (const f of section.fields) {
        next[f.key] = defaultForm[f.key];
      }
      return next;
    });
  };

  const renderField = (field: (typeof formSections)[number]["fields"][number]) => {
    const value = form[field.key];
    const defaultValue = defaultForm[field.key];
    const isChanged = value !== defaultValue;
    return (
      <div key={String(field.key)} className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label className="flex items-center gap-2">
            <span>{field.label}{field.unit ? ` (${field.unit})` : ""}</span>
            <CashFlowHelp label={field.label}>{field.help}</CashFlowHelp>
          </Label>
          {isChanged ? (
            <Badge variant="outline" className="text-[11px] tabular-nums text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800/50">
              Default {String(defaultValue)}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[11px] tabular-nums text-zinc-500">
              Default
            </Badge>
          )}
        </div>
        <Input
          type="number"
          step={field.step ?? 1}
          value={value}
          onChange={(e) => setForm((p) => ({ ...p, [field.key]: Number(e.target.value) }))}
        />
      </div>
    );
  };

  return (
    <CashFlowPageShell
      title="Cash Flow Assumptions"
      description="Scenario tuning with clear defaults, explainers, and quick resets — designed for trust and speed."
      icon={<Settings2 className={`${cashFlowIcon.header} text-indigo-500/90`} />}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select
            value={horizonType}
            onValueChange={(v) => {
              const next = v as CashFlowHorizonType;
              setHorizonType(next);
              updateCashFlowContextInUrl({ horizonType: next, scenarioTag });
            }}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DAILY_30">30 days</SelectItem>
              <SelectItem value="WEEKLY_13">13 weeks</SelectItem>
              <SelectItem value="MONTHLY_12">12 months</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={scenarioTag}
            onValueChange={(v) => {
              const next = v as CashFlowScenarioTag;
              setScenarioTag(next);
              updateCashFlowContextInUrl({ horizonType, scenarioTag: next });
            }}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BASE">Base</SelectItem>
              <SelectItem value="BEST_CASE">Best case</SelectItem>
              <SelectItem value="WORST_CASE">Worst case</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2" disabled={loading}>
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <PopoverHeader>
                <PopoverTitle>Reset values</PopoverTitle>
              </PopoverHeader>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Reset to defaults or revert to the last loaded/saved values for this scenario.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={resetToLoaded}>
                    Revert to saved
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetAll}>
                    Reset all to defaults
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button onClick={onSave} disabled={saving || loading || !isDirty} className="h-9">
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Scenario: {scenarioTag.replaceAll("_", " ")}</span>
              {isDirty ? (
                <Badge variant="outline" className="border-indigo-200/60 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-300">
                  Unsaved changes
                </Badge>
              ) : (
                <Badge variant="outline" className="text-zinc-500">
                  Saved
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-[86px] rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/50 dark:bg-zinc-950/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100">Presets</p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Apply a starting point, then tweak with evidence from Variance and Drivers.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-8 gap-2" asChild>
                      <Link href={`/cash-flow/scenarios?${buildCashFlowContextQuery({ horizonType, scenarioTag })}`}>
                        <Wand2 className="h-4 w-4" />
                        See scenario diffs
                      </Link>
                    </Button>
                  </div>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
                    {curatedPresets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="text-left rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-3 hover:border-indigo-200 dark:hover:border-indigo-800/50 hover:shadow-sm transition"
                        onClick={() => {
                          setForm((prev) => p.apply(prev));
                          toast.message(`Applied preset: ${p.label}`);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{p.label}</div>
                          <Badge
                            variant="outline"
                            className={
                              p.tone === "positive"
                                ? "border-emerald-200 text-emerald-700 dark:border-emerald-900/40 dark:text-emerald-300"
                                : p.tone === "warning"
                                  ? "border-amber-200 text-amber-700 dark:border-amber-900/40 dark:text-amber-300"
                                  : "text-zinc-500"
                            }
                          >
                            Apply
                          </Badge>
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{p.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {formSections.map((section) => (
                  <div key={section.key} className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/50 dark:bg-zinc-950/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                          {section.title}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {section.description}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => resetSection(section.key)}
                      >
                        Reset section
                      </Button>
                    </div>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {section.fields.map(renderField)}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-zinc-500">
                  Saved under <code className="font-mono">{assumptionKey}</code>. These values only affect the selected scenario.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Saved profiles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="text-sm text-zinc-500">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-zinc-500">No saved assumptions yet.</div>
            ) : (
              <div className="space-y-2">
                {rows.slice(0, 12).map((r) => (
                  <Popover key={r.key}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full text-left rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/50 dark:bg-zinc-950/10 p-3 hover:border-indigo-200 dark:hover:border-indigo-800/50 hover:shadow-sm transition"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{r.key}</div>
                            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                              Click to preview values
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[11px] text-zinc-500">
                            View
                          </Badge>
                        </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[min(420px,calc(100vw-2rem))]">
                      <PopoverHeader>
                        <PopoverTitle className="truncate">{r.key}</PopoverTitle>
                      </PopoverHeader>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {Object.entries((r.valueJson ?? {}) as Record<string, unknown>)
                          .slice(0, 10)
                          .map(([k, v]) => (
                            <div
                              key={k}
                              className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/50 dark:bg-zinc-950/20 p-3"
                            >
                              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                {k.replaceAll(/([A-Z])/g, " $1").trim()}
                              </div>
                              <div className="mt-1 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                                {typeof v === "number" ? v.toLocaleString() : String(v)}
                              </div>
                            </div>
                          ))}
                      </div>
                      <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Showing up to 10 keys from <code className="font-mono">valueJson</code>.
                      </p>
                    </PopoverContent>
                  </Popover>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CashFlowPageShell>
  );
}

