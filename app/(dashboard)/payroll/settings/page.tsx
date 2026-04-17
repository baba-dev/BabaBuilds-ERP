"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Component, Layers2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PayComponentCategory } from "@prisma/client";

type ComponentRow = {
  id?: string;
  name: string;
  code: string;
  category: PayComponentCategory;
  isTaxable: boolean;
  isActive: boolean;
};

type Snapshot = {
  inputMode: string;
  components: ComponentRow[];
  statutoryRules: Record<string, unknown>;
  paymentSchedule: Record<string, unknown>;
  defaultCostAllocation: Record<string, unknown>;
};

export default function PayrollSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      const [compRes, payRes, statRes, allocRes] = await Promise.all([
        fetch("/api/payroll/settings/components", { cache: "no-store" }),
        fetch("/api/payroll/settings/payment-schedule", { cache: "no-store" }),
        fetch("/api/payroll/settings/statutory-rules", { cache: "no-store" }),
        fetch("/api/payroll/settings/default-cost-allocation", { cache: "no-store" }),
      ]);

      if (!compRes.ok) {
        const j = (await compRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Components ${compRes.status}`);
      }
      const full = (await compRes.json()) as Snapshot;
      const pay = payRes.ok ? ((await payRes.json()) as { paymentSchedule: Record<string, unknown> }) : null;
      const stat = statRes.ok ? ((await statRes.json()) as { statutoryRules: Record<string, unknown> }) : null;
      const alloc = allocRes.ok
        ? ((await allocRes.json()) as { defaultCostAllocation: Record<string, unknown> })
        : null;

      setSnapshot({
        inputMode: full.inputMode,
        components: (full.components as unknown as ComponentRow[]).map((c) => ({
          id: (c as { id?: string }).id,
          name: c.name,
          code: c.code,
          category: c.category,
          isTaxable: c.isTaxable ?? true,
          isActive: c.isActive ?? true,
        })),
        statutoryRules: stat?.statutoryRules ?? full.statutoryRules ?? {},
        paymentSchedule: pay?.paymentSchedule ?? full.paymentSchedule ?? {},
        defaultCostAllocation: alloc?.defaultCostAllocation ?? full.defaultCostAllocation ?? {},
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchJson = async (url: string, body: unknown, label: string) => {
    setSaving(label);
    setFieldErrors({});
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fieldErrors?: Record<string, string>;
      };
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        throw new Error(data.error || `${label} save failed (${res.status})`);
      }
      toast.success(`${label} saved`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const saveComponents = () => {
    if (!snapshot) return;
    void patchJson(
      "/api/payroll/settings/components",
      {
        components: snapshot.components.map((c) => ({
          name: c.name,
          code: c.code,
          category: c.category,
          isTaxable: c.isTaxable,
          isActive: c.isActive,
        })),
      },
      "Components",
    );
  };

  const savePaymentSchedule = () => {
    if (!snapshot) return;
    void patchJson("/api/payroll/settings/payment-schedule", { paymentSchedule: snapshot.paymentSchedule }, "Payment schedule");
  };

  const saveStatutory = () => {
    if (!snapshot) return;
    void patchJson("/api/payroll/settings/statutory-rules", { statutoryRules: snapshot.statutoryRules }, "Statutory rules");
  };

  const saveAllocation = () => {
    if (!snapshot) return;
    void patchJson(
      "/api/payroll/settings/default-cost-allocation",
      { defaultCostAllocation: snapshot.defaultCostAllocation },
      "Cost allocation",
    );
  };

  return (
    <DashboardPageShell
      title="Payroll Settings Studio"
      description="Manage earning components, policy rules, and payout schedules with audit-friendly clarity."
      icon={<SlidersHorizontal className="h-5 w-5 text-cyan-500" />}
      kpiCard={{ label: "Active components", value: snapshot?.components.filter((c) => c.isActive).length ?? 0 }}
      primaryAction={
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      }
    >
      <div className="space-y-6">
        {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-800 dark:text-rose-200">{error}</div> : null}
        {Object.keys(fieldErrors).length > 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            {Object.entries(fieldErrors).map(([k, v]) => (
              <p key={k}>
                {k}: {v}
              </p>
            ))}
          </div>
        ) : null}

        <section className="rounded-3xl border border-zinc-200/70 bg-gradient-to-br from-cyan-500/[0.10] via-background to-indigo-500/[0.06] p-6 dark:border-zinc-800/70">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Configuration quality</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Components and rules drive the next run</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Input mode: <span className="font-medium">{snapshot?.inputMode ?? "—"}</span>. Changes require{" "}
            <code className="text-xs">payroll.settings.manage</code>.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 rounded-2xl border border-zinc-200/70 bg-white/80 p-5 dark:border-zinc-800/70 dark:bg-zinc-900/30">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Component className="h-4 w-4 text-cyan-500" />
                <h3 className="text-base font-semibold">Components</h3>
              </div>
              <Button size="sm" variant="default" disabled={loading || !snapshot} onClick={saveComponents}>
                {saving === "Components" ? "Saving…" : "Save components"}
              </Button>
            </div>
            <div className="space-y-2">
              {loading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="rounded-xl border border-zinc-200/60 bg-white/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <div className="animate-pulse space-y-2">
                      <div className="h-3 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
                      <div className="h-3 w-24 rounded bg-zinc-200/70 dark:bg-zinc-800/60" />
                    </div>
                  </div>
                ))
              ) : snapshot?.components.length ? (
                snapshot.components.map((item, idx) => (
                  <div key={`${item.code}-${idx}`} className="rounded-xl border border-zinc-200/60 bg-white/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const next = [...snapshot.components];
                            next[idx] = { ...next[idx]!, name: e.target.value };
                            setSnapshot({ ...snapshot, components: next });
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Code</Label>
                        <Input
                          value={item.code}
                          onChange={(e) => {
                            const next = [...snapshot.components];
                            next[idx] = { ...next[idx]!, code: e.target.value };
                            setSnapshot({ ...snapshot, components: next });
                          }}
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      {item.category} · Taxable {item.isTaxable ? "yes" : "no"}
                    </p>
                    <Badge className="mt-1 rounded-full bg-zinc-500/10 text-zinc-700 dark:text-zinc-300">
                      {item.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No pay components configured.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 dark:border-zinc-800/70 dark:bg-zinc-900/30">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers2 className="h-4 w-4 text-indigo-500" />
                <h3 className="text-base font-semibold">Statutory rules</h3>
              </div>
              <Button size="sm" disabled={loading || !snapshot} onClick={saveStatutory}>
                {saving === "Statutory rules" ? "Saving…" : "Save"}
              </Button>
            </div>
            <pre className="max-h-48 overflow-auto rounded-lg border border-zinc-200/60 bg-zinc-50 p-2 text-[11px] dark:border-zinc-800 dark:bg-zinc-950">
              {JSON.stringify(snapshot?.statutoryRules ?? {}, null, 2)}
            </pre>
            <p className="mt-2 text-xs text-zinc-500">Edit JSON in a dedicated editor in a follow-up; for now adjust via API or DB seed.</p>
          </section>
        </div>

        <section className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 dark:border-zinc-800/70 dark:bg-zinc-900/30">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-emerald-500" />
              <h3 className="text-base font-semibold">Payment schedule</h3>
            </div>
            <Button size="sm" disabled={loading || !snapshot} onClick={savePaymentSchedule}>
              {saving === "Payment schedule" ? "Saving…" : "Save schedule"}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {["frequency", "payDay", "processingOffsetDays", "payoutMethod"].map((key) => (
              <div key={key}>
                <Label className="text-xs capitalize">{key}</Label>
                <Input
                  value={String(snapshot?.paymentSchedule[key] ?? "")}
                  onChange={(e) => {
                    if (!snapshot) return;
                    const v = e.target.value;
                    const num = Number(v);
                    setSnapshot({
                      ...snapshot,
                      paymentSchedule: {
                        ...snapshot.paymentSchedule,
                        [key]: key === "payDay" || key === "processingOffsetDays" ? (Number.isFinite(num) ? num : v) : v,
                      },
                    });
                  }}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 dark:border-zinc-800/70 dark:bg-zinc-900/30">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold">Default cost allocation</h3>
            <Button size="sm" disabled={loading || !snapshot} onClick={saveAllocation}>
              {saving === "Cost allocation" ? "Saving…" : "Save allocation"}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {["strategy", "fallbackCostCenter"].map((key) => (
              <div key={key}>
                <Label className="text-xs capitalize">{key}</Label>
                <Input
                  value={String(snapshot?.defaultCostAllocation[key] ?? "")}
                  onChange={(e) => {
                    if (!snapshot) return;
                    setSnapshot({
                      ...snapshot,
                      defaultCostAllocation: {
                        ...snapshot.defaultCostAllocation,
                        [key]: e.target.value,
                      },
                    });
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardPageShell>
  );
}
