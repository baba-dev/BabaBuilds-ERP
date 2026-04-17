"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarRange,
  Component,
  Layers2,
  Link2,
  Loader2,
  Plus,
  Save,
  Shield,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { PayComponentCategory, PayrollInputMode } from "@prisma/client";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { StandalonePayrollConfig, WorkforceLinkedPayrollConfig } from "@/lib/payroll/settings";

type ComponentRow = {
  id?: string;
  name: string;
  code: string;
  category: PayComponentCategory;
  isTaxable: boolean;
  isActive: boolean;
};

type StatutoryRulesState = {
  professionalTaxEnabled: boolean;
  socialSecurityEnabled: boolean;
  providentFundEnabled: boolean;
  esiEnabled: boolean;
};

type PaymentScheduleState = {
  frequency: string;
  payDay: number;
  processingOffsetDays: number;
  payoutMethod: string;
};

type CostAllocationState = {
  strategy: string;
  fallbackCostCenter: string;
  splitBy: string[];
};

type Snapshot = {
  inputMode: PayrollInputMode;
  components: ComponentRow[];
  standaloneConfig: StandalonePayrollConfig;
  workforceLinkedConfig: WorkforceLinkedPayrollConfig;
  statutoryRules: StatutoryRulesState;
  paymentSchedule: PaymentScheduleState;
  defaultCostAllocation: CostAllocationState;
};

const CATEGORY_OPTIONS = Object.values(PayComponentCategory);

function normalizeSnapshot(raw: Record<string, unknown>): Snapshot {
  const sr = (raw.statutoryRules ?? {}) as Record<string, unknown>;
  const ps = (raw.paymentSchedule ?? {}) as Record<string, unknown>;
  const da = (raw.defaultCostAllocation ?? {}) as Record<string, unknown>;
  const st = (raw.standaloneConfig ?? {}) as Partial<StandalonePayrollConfig>;
  const wl = (raw.workforceLinkedConfig ?? {}) as Partial<WorkforceLinkedPayrollConfig>;

  return {
    inputMode: (raw.inputMode as PayrollInputMode) ?? "STANDALONE",
    components: ((raw.components as ComponentRow[]) ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      category: c.category,
      isTaxable: c.isTaxable ?? true,
      isActive: c.isActive ?? true,
    })),
    standaloneConfig: {
      allowManualRecords: st.allowManualRecords ?? true,
      allowCsvImport: st.allowCsvImport ?? true,
      csvTemplateHeaders: Array.isArray(st.csvTemplateHeaders)
        ? (st.csvTemplateHeaders as string[])
        : ["employee_code", "base_salary", "allowance", "variable_pay", "deductions"],
    },
    workforceLinkedConfig: {
      autoMapDepartment: wl.autoMapDepartment ?? true,
      autoMapDesignation: wl.autoMapDesignation ?? true,
      attendancePolicySource: wl.attendancePolicySource ?? "WORKFORCE_ATTENDANCE",
      leavePolicySource: wl.leavePolicySource ?? "WORKFORCE_LEAVE",
    },
    statutoryRules: {
      professionalTaxEnabled: Boolean(sr.professionalTaxEnabled),
      socialSecurityEnabled: Boolean(sr.socialSecurityEnabled),
      providentFundEnabled: Boolean(sr.providentFundEnabled),
      esiEnabled: Boolean(sr.esiEnabled),
    },
    paymentSchedule: {
      frequency: String(ps.frequency ?? "MONTHLY"),
      payDay: typeof ps.payDay === "number" ? ps.payDay : Number(ps.payDay) || 1,
      processingOffsetDays:
        typeof ps.processingOffsetDays === "number"
          ? ps.processingOffsetDays
          : Number(ps.processingOffsetDays) || 2,
      payoutMethod: String(ps.payoutMethod ?? "BANK_TRANSFER"),
    },
    defaultCostAllocation: {
      strategy: String(da.strategy ?? "DEPARTMENT"),
      fallbackCostCenter: String(da.fallbackCostCenter ?? "GENERAL"),
      splitBy: Array.isArray(da.splitBy) ? (da.splitBy as string[]) : [],
    },
  };
}

export function PayrollSettingsStudio() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dirtySection, setDirtySection] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [readOnly, setReadOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [capRes, compRes] = await Promise.all([
        fetch("/api/payroll/settings/capabilities", { cache: "no-store" }),
        fetch("/api/payroll/settings/components", { cache: "no-store" }),
      ]);

      if (capRes.ok) {
        const caps = (await capRes.json()) as { canManage?: boolean; readOnly?: boolean };
        setCanManage(Boolean(caps.canManage));
        setReadOnly(Boolean(caps.readOnly));
      }

      if (!compRes.ok) {
        const j = (await compRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Load failed (${compRes.status})`);
      }

      const full = (await compRes.json()) as Record<string, unknown>;
      setSnapshot(normalizeSnapshot(full));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchComponents = async (body: Record<string, unknown>, label: string) => {
    if (!canManage) {
      toast.error("You need payroll settings permission to save.");
      return;
    }
    setSaving(label);
    try {
      const res = await fetch("/api/payroll/settings/components", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(`${label} saved`);
      setDirtySection(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const patchEndpoint = async (url: string, body: unknown, label: string) => {
    if (!canManage) {
      toast.error("You need payroll settings permission to save.");
      return;
    }
    setSaving(label);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(`${label} saved`);
      setDirtySection(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  if (loading && !snapshot) {
    return (
      <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-500" />
        Loading payroll configuration…
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-6 text-sm text-rose-800 dark:text-rose-200">
        {error ?? "Unable to load settings."}
      </div>
    );
  }

  const disabled = !canManage || saving !== null;

  return (
    <div className="space-y-8">
      {readOnly ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-950/30 dark:text-amber-100">
          View-only mode. Ask an administrator to grant <code className="text-xs">payroll.settings.manage</code> to edit
          configuration.
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Workspace payroll</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Configuration studio
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Structured controls for pay components, statutory toggles, payout cadence, and cost allocation — aligned with
            your ledger and compliance posture.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="components" className="gap-6">
        <TabsList variant="line" className="w-full flex-wrap justify-start gap-1 border-b border-zinc-200/80 bg-transparent p-0 pb-0 dark:border-zinc-800">
          <TabsTrigger value="components" className="gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-cyan-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
            <Component className="h-4 w-4" />
            Components
          </TabsTrigger>
          <TabsTrigger value="compliance" className="gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-indigo-500 data-[state=active]:bg-transparent">
            <Shield className="h-4 w-4" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent">
            <CalendarRange className="h-4 w-4" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="allocation" className="gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-violet-500 data-[state=active]:bg-transparent">
            <Layers2 className="h-4 w-4" />
            Allocation
          </TabsTrigger>
          <TabsTrigger value="integration" className="gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-sky-500 data-[state=active]:bg-transparent">
            <Link2 className="h-4 w-4" />
            Integration
          </TabsTrigger>
        </TabsList>

        <TabsContent value="components" className="space-y-4 outline-none">
          <Card className="border-zinc-200/80 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-lg">Pay components</CardTitle>
                <CardDescription>Earnings, deductions, and employer lines used in payroll runs.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    setSnapshot({
                      ...snapshot,
                      components: [
                        ...snapshot.components,
                        {
                          name: "New component",
                          code: `CMP_${snapshot.components.length + 1}`,
                          category: PayComponentCategory.ALLOWANCE,
                          isTaxable: true,
                          isActive: true,
                        },
                      ],
                    });
                    setDirtySection("components");
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add row
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-cyan-600 hover:bg-cyan-700"
                  disabled={disabled}
                  onClick={() =>
                    patchComponents(
                      {
                        components: snapshot.components.map((c) => ({
                          name: c.name.trim(),
                          code: c.code.trim(),
                          category: c.category,
                          isTaxable: c.isTaxable,
                          isActive: c.isActive,
                        })),
                      },
                      "Components",
                    )
                  }
                >
                  {saving === "Components" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  Save
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot.components.length === 0 ? (
                <p className="text-sm text-zinc-500">No components yet. Add your first pay line.</p>
              ) : (
                snapshot.components.map((row, idx) => (
                  <div
                    key={`${row.code}-${idx}`}
                    className="rounded-xl border border-zinc-200/70 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
                  >
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={row.name}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = [...snapshot.components];
                            next[idx] = { ...next[idx]!, name: e.target.value };
                            setSnapshot({ ...snapshot, components: next });
                            setDirtySection("components");
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Code</Label>
                        <Input
                          value={row.code}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = [...snapshot.components];
                            next[idx] = { ...next[idx]!, code: e.target.value.toUpperCase() };
                            setSnapshot({ ...snapshot, components: next });
                            setDirtySection("components");
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Category</Label>
                        <Select
                          value={row.category}
                          disabled={disabled}
                          onValueChange={(v) => {
                            const next = [...snapshot.components];
                            next[idx] = { ...next[idx]!, category: v as PayComponentCategory };
                            setSnapshot({ ...snapshot, components: next });
                            setDirtySection("components");
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORY_OPTIONS.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 pt-6">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={row.isTaxable}
                            disabled={disabled}
                            onCheckedChange={(checked) => {
                              const next = [...snapshot.components];
                              next[idx] = { ...next[idx]!, isTaxable: checked };
                              setSnapshot({ ...snapshot, components: next });
                              setDirtySection("components");
                            }}
                          />
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">Taxable</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={row.isActive}
                            disabled={disabled}
                            onCheckedChange={(checked) => {
                              const next = [...snapshot.components];
                              next[idx] = { ...next[idx]!, isActive: checked };
                              setSnapshot({ ...snapshot, components: next });
                              setDirtySection("components");
                            }}
                          />
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">Active</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-zinc-400 hover:text-rose-600"
                          disabled={disabled}
                          onClick={() => {
                            const next = snapshot.components.filter((_, i) => i !== idx);
                            setSnapshot({ ...snapshot, components: next });
                            setDirtySection("components");
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {dirtySection === "components" ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes — click Save to persist.</p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4 outline-none">
          <Card className="border-zinc-200/80 bg-white/90 dark:border-zinc-800 dark:bg-zinc-950/40">
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-lg">Statutory & registers</CardTitle>
                <CardDescription>India-first toggles; extend schema as you add jurisdictions.</CardDescription>
              </div>
              <Button
                size="sm"
                disabled={disabled}
                onClick={() =>
                  patchEndpoint("/api/payroll/settings/statutory-rules", { statutoryRules: snapshot.statutoryRules }, "Compliance")
                }
              >
                {saving === "Compliance" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                Save
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["professionalTaxEnabled", "Professional tax (PT)"],
                  ["socialSecurityEnabled", "Social security / EPF exposure"],
                  ["providentFundEnabled", "Provident fund (PF)"],
                  ["esiEnabled", "ESI"],
                ] as const
              ).map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-xl border border-zinc-200/60 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/40"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
                    <p className="text-xs text-zinc-500">Included in statutory preview when enabled.</p>
                  </div>
                  <Switch
                    checked={snapshot.statutoryRules[key]}
                    disabled={disabled}
                    onCheckedChange={(checked) => {
                      setSnapshot({
                        ...snapshot,
                        statutoryRules: { ...snapshot.statutoryRules, [key]: checked },
                      });
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4 outline-none">
          <Card className="border-zinc-200/80 bg-white/90 dark:border-zinc-800 dark:bg-zinc-950/40">
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-lg">Payment schedule</CardTitle>
                <CardDescription>Processing offsets and payout rails for cash forecasting.</CardDescription>
              </div>
              <Button
                size="sm"
                disabled={disabled}
                onClick={() =>
                  patchEndpoint("/api/payroll/settings/payment-schedule", { paymentSchedule: snapshot.paymentSchedule }, "Schedule")
                }
              >
                {saving === "Schedule" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                Save
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Frequency</Label>
                <Select
                  value={snapshot.paymentSchedule.frequency}
                  disabled={disabled}
                  onValueChange={(v) =>
                    setSnapshot({
                      ...snapshot,
                      paymentSchedule: { ...snapshot.paymentSchedule, frequency: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["MONTHLY", "BIWEEKLY", "WEEKLY", "SEMIMONTHLY"].map((f) => (
                      <SelectItem key={f} value={f}>
                        {f.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payout method</Label>
                <Select
                  value={snapshot.paymentSchedule.payoutMethod}
                  disabled={disabled}
                  onValueChange={(v) =>
                    setSnapshot({
                      ...snapshot,
                      paymentSchedule: { ...snapshot.paymentSchedule, payoutMethod: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["BANK_TRANSFER", "ACH", "CHEQUE", "CASH"].map((f) => (
                      <SelectItem key={f} value={f}>
                        {f.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pay day (calendar day)</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  disabled={disabled}
                  value={snapshot.paymentSchedule.payDay}
                  onChange={(e) =>
                    setSnapshot({
                      ...snapshot,
                      paymentSchedule: {
                        ...snapshot.paymentSchedule,
                        payDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)),
                      },
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Processing offset (days)</Label>
                <Input
                  type="number"
                  min={0}
                  max={30}
                  disabled={disabled}
                  value={snapshot.paymentSchedule.processingOffsetDays}
                  onChange={(e) =>
                    setSnapshot({
                      ...snapshot,
                      paymentSchedule: {
                        ...snapshot.paymentSchedule,
                        processingOffsetDays: Math.max(0, Number(e.target.value) || 0),
                      },
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allocation" className="space-y-4 outline-none">
          <Card className="border-zinc-200/80 bg-white/90 dark:border-zinc-800 dark:bg-zinc-950/40">
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-lg">Cost allocation defaults</CardTitle>
                <CardDescription>Drive labor cost splits for GL and project P&amp;L.</CardDescription>
              </div>
              <Button
                size="sm"
                disabled={disabled}
                onClick={() =>
                  patchEndpoint(
                    "/api/payroll/settings/default-cost-allocation",
                    { defaultCostAllocation: snapshot.defaultCostAllocation },
                    "Allocation",
                  )
                }
              >
                {saving === "Allocation" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                Save
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Strategy</Label>
                <Select
                  value={snapshot.defaultCostAllocation.strategy}
                  disabled={disabled}
                  onValueChange={(v) =>
                    setSnapshot({
                      ...snapshot,
                      defaultCostAllocation: { ...snapshot.defaultCostAllocation, strategy: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["DEPARTMENT", "PROJECT", "MIXED"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fallback cost center</Label>
                <Input
                  disabled={disabled}
                  value={snapshot.defaultCostAllocation.fallbackCostCenter}
                  onChange={(e) =>
                    setSnapshot({
                      ...snapshot,
                      defaultCostAllocation: {
                        ...snapshot.defaultCostAllocation,
                        fallbackCostCenter: e.target.value.toUpperCase(),
                      },
                    })
                  }
                />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs">Secondary split dimensions (comma-separated)</Label>
                <Input
                  disabled={disabled}
                  placeholder="PROJECT, LOCATION"
                  value={snapshot.defaultCostAllocation.splitBy.join(", ")}
                  onChange={(e) =>
                    setSnapshot({
                      ...snapshot,
                      defaultCostAllocation: {
                        ...snapshot.defaultCostAllocation,
                        splitBy: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integration" className="space-y-4 outline-none">
          <Card className="border-zinc-200/80 bg-white/90 dark:border-zinc-800 dark:bg-zinc-950/40">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-sky-500" />
                Input mode & Workforce
              </CardTitle>
              <CardDescription>
                Choose standalone payroll capture or derive context from Workforce when that module is enabled.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline" className={cn(snapshot.inputMode === "STANDALONE" && "border-cyan-500/50 bg-cyan-500/10")}>
                  Standalone
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(snapshot.inputMode === "WORKFORCE_LINKED" && "border-sky-500/50 bg-sky-500/10")}
                >
                  Workforce-linked
                </Badge>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-zinc-200/70 p-4 dark:border-zinc-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Standalone ingestion</p>
                    <Switch
                      checked={snapshot.inputMode === "STANDALONE"}
                      disabled={disabled}
                      onCheckedChange={(on) => {
                        if (on)
                          setSnapshot({
                            ...snapshot,
                            inputMode: "STANDALONE",
                          });
                      }}
                    />
                  </div>
                  <Separator className="my-3" />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">Manual payroll rows</span>
                      <Switch
                        checked={snapshot.standaloneConfig.allowManualRecords}
                        disabled={disabled || snapshot.inputMode !== "STANDALONE"}
                        onCheckedChange={(v) =>
                          setSnapshot({
                            ...snapshot,
                            standaloneConfig: { ...snapshot.standaloneConfig, allowManualRecords: v },
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">CSV import</span>
                      <Switch
                        checked={snapshot.standaloneConfig.allowCsvImport}
                        disabled={disabled || snapshot.inputMode !== "STANDALONE"}
                        onCheckedChange={(v) =>
                          setSnapshot({
                            ...snapshot,
                            standaloneConfig: { ...snapshot.standaloneConfig, allowCsvImport: v },
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200/70 p-4 dark:border-zinc-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Workforce-linked</p>
                    <Switch
                      checked={snapshot.inputMode === "WORKFORCE_LINKED"}
                      disabled={disabled}
                      onCheckedChange={(on) => {
                        if (on)
                          setSnapshot({
                            ...snapshot,
                            inputMode: "WORKFORCE_LINKED",
                          });
                      }}
                    />
                  </div>
                  <Separator className="my-3" />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">Auto-map department</span>
                      <Switch
                        checked={snapshot.workforceLinkedConfig.autoMapDepartment}
                        disabled={disabled || snapshot.inputMode !== "WORKFORCE_LINKED"}
                        onCheckedChange={(v) =>
                          setSnapshot({
                            ...snapshot,
                            workforceLinkedConfig: { ...snapshot.workforceLinkedConfig, autoMapDepartment: v },
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">Auto-map designation</span>
                      <Switch
                        checked={snapshot.workforceLinkedConfig.autoMapDesignation}
                        disabled={disabled || snapshot.inputMode !== "WORKFORCE_LINKED"}
                        onCheckedChange={(v) =>
                          setSnapshot({
                            ...snapshot,
                            workforceLinkedConfig: { ...snapshot.workforceLinkedConfig, autoMapDesignation: v },
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Button
                disabled={disabled}
                className="bg-sky-600 hover:bg-sky-700"
                onClick={() =>
                  patchComponents(
                    {
                      inputMode: snapshot.inputMode,
                      standaloneConfig: snapshot.standaloneConfig,
                      workforceLinkedConfig: snapshot.workforceLinkedConfig,
                    },
                    "Integration",
                  )
                }
              >
                {saving === "Integration" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save integration profile
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
