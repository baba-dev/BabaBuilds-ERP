"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlarmClock, ArrowRight, CheckCircle2, FileBarChart2, Repeat, Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { emitMarketingAnalyticsEvent } from "@/lib/marketing-analytics";

type FlowId = "win_client" | "bill_retainer" | "recover_overdue" | "month_end_tax_pack";

type FlowStep = {
  label: string;
  href: string;
  description: string;
};

type FlowDef = {
  id: FlowId;
  title: string;
  description: string;
  icon: typeof Trophy;
  steps: FlowStep[];
};

const FLOW_DEFS: FlowDef[] = [
  {
    id: "win_client",
    title: "Win client",
    description: "Move from lead intent to your first billable invoice.",
    icon: Trophy,
    steps: [
      { label: "Add client profile", href: "/clients", description: "Create one client with legal + billing contact details." },
      { label: "Send proposal", href: "/proposals", description: "Draft and share a proposal aligned to your services." },
      { label: "Track pipeline", href: "/proposals/pipeline", description: "Move accepted proposal to delivery-ready state." },
      { label: "Create invoice", href: "/invoice", description: "Issue your first invoice and start collections." },
    ],
  },
  {
    id: "bill_retainer",
    title: "Bill monthly retainer",
    description: "Set up recurring revenue and reduce manual billing.",
    icon: Repeat,
    steps: [
      { label: "Add client", href: "/clients", description: "Choose the client that needs monthly retainers." },
      { label: "Define service package", href: "/services", description: "Create a reusable package for recurring billing." },
      { label: "Create retainer", href: "/retainers", description: "Set monthly amount, start date, and notes." },
      { label: "Generate invoice", href: "/invoice", description: "Issue the first retainer invoice from your catalog." },
    ],
  },
  {
    id: "recover_overdue",
    title: "Recover overdue payment",
    description: "Prioritize high-risk dues and close outstanding receivables.",
    icon: AlarmClock,
    steps: [
      { label: "Review AR queue", href: "/ar-collections", description: "Sort invoices by overdue days and priority score." },
      { label: "Open invoice details", href: "/invoice", description: "Confirm amount due, reminders, and follow-up status." },
      { label: "Send reminder", href: "/ar-collections", description: "Trigger follow-up and update promise-to-pay notes." },
      { label: "Record payment", href: "/invoice", description: "Log payment and close overdue status." },
    ],
  },
  {
    id: "month_end_tax_pack",
    title: "Prepare month-end tax pack",
    description: "Run compliance readiness, then close your filing cycle.",
    icon: FileBarChart2,
    steps: [
      { label: "Open tax hub", href: "/tax/hub", description: "Check blockers, obligations, and return status." },
      { label: "Run readiness checks", href: "/tax/hub", description: "Validate tax-ready books and missing documents." },
      { label: "Review returns", href: "/tax", description: "Inspect return periods and amounts before filing." },
      { label: "Mark filing complete", href: "/tax", description: "Record month-end filed status and audit evidence." },
    ],
  },
];

function getFlowStorageKey(flowId: FlowId) {
  return `flow:${flowId}:done`;
}

export function GuidedFlowsHub() {
  const [activeFlow, setActiveFlow] = useState<FlowId | null>(null);
  const [completionMap, setCompletionMap] = useState<Record<FlowId, boolean>>({
    win_client: false,
    bill_retainer: false,
    recover_overdue: false,
    month_end_tax_pack: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only state sync after mount (avoids SSR hydration mismatch)
    setCompletionMap({
      win_client: window.localStorage.getItem(getFlowStorageKey("win_client")) === "1",
      bill_retainer: window.localStorage.getItem(getFlowStorageKey("bill_retainer")) === "1",
      recover_overdue: window.localStorage.getItem(getFlowStorageKey("recover_overdue")) === "1",
      month_end_tax_pack: window.localStorage.getItem(getFlowStorageKey("month_end_tax_pack")) === "1",
    });
  }, [activeFlow]);

  const markDone = (flowId: FlowId) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(getFlowStorageKey(flowId), "1");
    }
    emitMarketingAnalyticsEvent("marketing_cta_click", { location: "dashboard_guided_flow_completed", label: flowId });
    setActiveFlow(flowId);
    setCompletionMap((prev) => ({ ...prev, [flowId]: true }));
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
          Guided money flows
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Action playbooks for revenue, collections, and tax operations.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {FLOW_DEFS.map((flow) => {
          const FlowIcon = flow.icon;
          const done = completionMap[flow.id];
          return (
            <Sheet key={flow.id}>
              <Card className="border-zinc-200 dark:border-zinc-800">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      <FlowIcon className="h-4 w-4" />
                    </div>
                    {done ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        Done
                      </span>
                    ) : null}
                  </div>
                  <CardTitle className="text-base">{flow.title}</CardTitle>
                  <CardDescription className="text-xs">{flow.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between rounded-xl"
                      onClick={() => {
                        setActiveFlow(flow.id);
                        emitMarketingAnalyticsEvent("marketing_cta_click", { location: "dashboard_guided_flow_opened", label: flow.id });
                      }}
                    >
                      Open flow <ArrowRight className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                </CardContent>
              </Card>
              <SheetContent className="overflow-y-auto sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle>{flow.title}</SheetTitle>
                  <SheetDescription>{flow.description}</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-3">
                  {flow.steps.map((step, index) => (
                    <div key={`${flow.id}-${step.href}-${index}`} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                        Step {index + 1}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{step.label}</p>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{step.description}</p>
                      <Button asChild size="sm" variant="secondary" className="mt-3 rounded-lg">
                        <Link href={step.href}>Go to step</Link>
                      </Button>
                    </div>
                  ))}
                </div>
                <Button className="mt-6 w-full rounded-xl" onClick={() => markDone(flow.id)}>
                  Mark this flow as completed
                </Button>
              </SheetContent>
            </Sheet>
          );
        })}
      </div>
    </section>
  );
}
