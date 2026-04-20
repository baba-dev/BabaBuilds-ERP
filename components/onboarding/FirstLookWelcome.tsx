"use client";

import Link from "next/link";
import { ArrowRight, Briefcase, LayoutDashboard, Settings2, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const firstLookCards = [
  {
    icon: LayoutDashboard,
    title: "Business Command Center",
    body: "Track setup readiness, receivables, and operational health from one premium dashboard.",
    href: "/dashboard",
    cta: "Open dashboard",
  },
  {
    icon: Users,
    title: "Client Pipeline",
    body: "Create your first client profile so you can bill faster and keep records clean.",
    href: "/clients",
    cta: "Add client",
  },
  {
    icon: Briefcase,
    title: "Service Catalog",
    body: "Define your offer once and reuse it across invoices, proposals, and retainers.",
    href: "/services",
    cta: "Create service",
  },
  {
    icon: Settings2,
    title: "Workspace Settings",
    body: "Complete your profile, invoicing defaults, and compliance details for a clean launch.",
    href: "/settings",
    cta: "Finish setup",
  },
];

export function FirstLookWelcome({ companyName }: { companyName?: string | null }) {
  return (
    <section className="rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50 via-white to-amber-50 p-5 dark:border-indigo-900/50 dark:from-indigo-950/30 dark:via-zinc-900 dark:to-amber-950/20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            First Look
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
            {companyName ? `Welcome, ${companyName}` : "Welcome to BabaBuilds ERP"}
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Your workspace is ready. Follow these high-impact actions to unlock the full ERP experience.
          </p>
        </div>
        <Button asChild size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white">
          <Link href="/settings">
            Review setup
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {firstLookCards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group rounded-xl border border-zinc-200/80 bg-white/80 p-4 transition-all hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-indigo-800"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                <card.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{card.title}</p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{card.body}</p>
                <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                  {card.cta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
