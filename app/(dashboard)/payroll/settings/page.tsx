"use client";

import { useEffect, useState } from "react";
import { CalendarRange, CircleDashed, Component, Layers2, SlidersHorizontal } from "lucide-react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const components = [
  { name: "Base Salary", type: "Earning", frequency: "Each cycle", status: "Active" },
  { name: "Overtime 1.5x", type: "Earning", frequency: "Conditional", status: "Active" },
  { name: "Provident Fund", type: "Deduction", frequency: "Each cycle", status: "Active" },
  { name: "Meal Card", type: "Benefit", frequency: "Monthly", status: "Draft" },
];

const rules = [
  { title: "Late attendance deduction threshold", value: "After 3 events / period", owner: "People Ops" },
  { title: "Overtime cap", value: "20h per period", owner: "Finance" },
  { title: "Probation tax treatment", value: "Standard withholding", owner: "Payroll" },
];

const schedules = [
  { name: "Bi-monthly salaried", date: "1st & 16th", timezone: "America/New_York" },
  { name: "Monthly contractors", date: "Last business day", timezone: "America/Chicago" },
];

export default function PayrollSettingsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <DashboardPageShell
      title="Payroll Settings Studio"
      description="Manage earning components, policy rules, and payout schedules with audit-friendly clarity."
      icon={<SlidersHorizontal className="h-5 w-5 text-cyan-500" />}
      kpiCard={{ label: "Active policies", value: 12 }}
      primaryAction={<Button>Publish policy bundle</Button>}
    >
      <div className="space-y-6">
        <section className="rounded-3xl border border-zinc-200/70 bg-gradient-to-br from-cyan-500/[0.10] via-background to-indigo-500/[0.06] p-6 dark:border-zinc-800/70">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Configuration quality</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Components and rules are versioned for the next run</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Preview impact, stage approval, and publish changes without disrupting in-flight payroll runs.</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 rounded-2xl border border-zinc-200/70 bg-white/80 p-5 dark:border-zinc-800/70 dark:bg-zinc-900/30">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Component className="h-4 w-4 text-cyan-500" />
                <h3 className="text-base font-semibold">Components</h3>
              </div>
              <Button size="sm" variant="outline">Add component</Button>
            </div>
            <div className="space-y-2">
              {loading
                ? Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="rounded-xl border border-zinc-200/60 bg-white/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <div className="animate-pulse space-y-2">
                      <div className="h-3 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
                      <div className="h-3 w-24 rounded bg-zinc-200/70 dark:bg-zinc-800/60" />
                    </div>
                  </div>
                ))
                : components.map((item) => (
                  <div key={item.name} className="rounded-xl border border-zinc-200/60 bg-white/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-zinc-500">{item.type} · {item.frequency}</p>
                      </div>
                      <Badge className="rounded-full bg-zinc-500/10 text-zinc-700 dark:text-zinc-300">{item.status}</Badge>
                    </div>
                  </div>
                ))}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 dark:border-zinc-800/70 dark:bg-zinc-900/30">
            <div className="mb-4 flex items-center gap-2">
              <Layers2 className="h-4 w-4 text-indigo-500" />
              <h3 className="text-base font-semibold">Rule packs</h3>
            </div>
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.title} className="rounded-xl border border-zinc-200/60 bg-white/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                  <p className="text-sm font-medium">{rule.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">{rule.value}</p>
                  <p className="mt-1 text-xs text-zinc-400">Owner: {rule.owner}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 dark:border-zinc-800/70 dark:bg-zinc-900/30">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-emerald-500" />
              <h3 className="text-base font-semibold">Schedules</h3>
            </div>
            <Button size="sm" variant="outline">Create schedule</Button>
          </div>
          {schedules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300/80 p-8 text-center dark:border-zinc-700/80">
              <CircleDashed className="mx-auto h-8 w-8 text-zinc-300" />
              <p className="mt-3 text-sm text-zinc-500">No schedules configured yet.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {schedules.map((schedule) => (
                <div key={schedule.name} className="rounded-xl border border-zinc-200/60 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                  <p className="text-sm font-semibold">{schedule.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">{schedule.date}</p>
                  <p className="mt-1 text-xs text-zinc-400">{schedule.timezone}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardPageShell>
  );
}
