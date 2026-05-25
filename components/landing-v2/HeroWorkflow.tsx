"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileSignature, FileText, HandCoins, Link2, Receipt, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const workflowSteps = [
  { label: "Proposal sent", icon: FileText },
  { label: "Client signed", icon: FileSignature },
  { label: "Invoice created", icon: Receipt },
  { label: "Payment link sent", icon: Link2 },
  { label: "Payment received", icon: HandCoins },
  { label: "Bank matched", icon: CheckCircle2 },
  { label: "Export ready for CA", icon: ShieldCheck },
] as const;

export default function HeroWorkflow() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950 px-5 py-10 text-white sm:px-8 md:px-10 md:py-14">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.12) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_30%,rgba(56,189,248,0.35),rgba(2,6,23,0)_40%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900/95 to-blue-950/80" />

      <div className="relative z-10 grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <span className="inline-flex rounded-full border border-blue-300/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-blue-100">
            Built for agencies, freelancers & service businesses
          </span>

          <h1 className="max-w-2xl text-balance text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
            Send proposals. Get signatures. Create invoices. Collect payments.
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-slate-200 sm:text-base">
            BabaBuilds ERP turns client work into signed, paid, tax-ready records — with retainers,
            payment links, expenses, bank matching, and CA-ready exports in one workspace.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="h-12 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white hover:bg-blue-400">
              <Link href="/login" data-cta="hero-live-demo" data-surface="home-v2-hero">Try Live Demo</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 rounded-xl border-white/20 bg-white/5 px-6 text-sm font-semibold text-white hover:bg-white/10">
              <Link href="/signup?plan=pro&cycle=monthly&trial=15&source=home-v2_hero" data-cta="hero-start-free" data-surface="home-v2-hero">Start Free <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl backdrop-blur-sm sm:p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Workflow</p>
          <div className="space-y-2">
            {workflowSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.label}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={reduceMotion ? undefined : { delay: index * 0.08, duration: 0.3 }}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-800/70 px-3 py-2.5"
                >
                  <div className="rounded-lg bg-blue-500/20 p-1.5 text-blue-200">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm text-slate-100">{step.label}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
