"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ShieldCheck, Sparkles, Globe, CheckCircle2, Workflow, Percent, Coins, Timer, LineChart, FileCheck2, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import LandingNavbar from "@/components/LandingNavbar";
import ComparisonTable from "@/components/ComparisonTable";
import PricingSection from "@/components/PricingSection";
import LandingFooter from "@/components/LandingFooter";
import RotatorText from "@/components/landing/RotatorText";
import RoleDemoLauncher from "@/components/landing/RoleDemoLauncher";
import FreeVsProComparison from "@/components/landing/FreeVsProComparison";
import { personaNavigationLinks } from "@/components/landing/persona/persona-config";
import { emitMarketingAnalyticsEvent } from "@/lib/marketing-analytics";
import HeroRevenueLoopVisual from "@/components/landing/HeroRevenueLoopVisual";
import FloatingPreferencesWidget from "@/components/landing/FloatingPreferencesWidget";
import SocialProofHero from "@/components/landing/SocialProofHero";

export default function LandingContent() {
  const t = useTranslations("Landing");
  const tp1 = useTranslations("LandingPhase1");
  const tPersona = useTranslations("LandingPersona");
  const reduceMotion = useReducedMotion();

  const trustMetrics = [
    { label: tp1("trustMetrics.automationsEnabled"), value: t("trustMetricValues.automations"), icon: Workflow },
    { label: tp1("trustMetrics.invoiceSuccessRate"), value: t("trustMetricValues.invoiceRate"), icon: Percent },
    { label: tp1("trustMetrics.supportedCurrencies"), value: t("trustMetricValues.currencies"), icon: Coins },
    { label: tp1("trustMetrics.avgSetupTime"), value: t("trustMetricValues.setupTime"), icon: Timer },
  ];

  const outcomePillars = [
    { icon: LineChart, title: "Predict cash flow weekly", body: "See expected inflows, outflows, and risk alerts before they become surprises." },
    { icon: FileCheck2, title: "Close books with confidence", body: "Run invoicing, collections, taxes, and compliance tasks from one operating system." },
    { icon: Users, title: "Scale team operations", body: "Standardize approvals, role access, and workflows as you grow across teams." },
  ];

  const PRIMARY_CTA = "/signup?plan=pro&cycle=monthly&trial=15&source=landing";
  const SECONDARY_CTA = "#demo-launcher";

  const trackTrialClick = (surface: string) => {
    emitMarketingAnalyticsEvent("marketing_trial_cta_clicked", {
      location: surface,
      label: tp1("cta.startTrial"),
      primaryCta: PRIMARY_CTA,
    });
  };

  const trackDemoClick = (surface: string) => {
    emitMarketingAnalyticsEvent("marketing_cta_click", {
      location: surface,
      label: tp1("cta.exploreDemo"),
      href: SECONDARY_CTA,
    });
  };

  const trackPersonaClick = (surface: string, href: string) => {
    emitMarketingAnalyticsEvent("marketing_cta_click", { location: surface, href });
  };

  return (
    <div className="overflow-x-hidden bg-surface-base">
      <LandingNavbar />

      <section className="relative flex items-center min-h-[min(100vh,920px)] px-6 pb-16 pt-28 md:pt-32">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-accent-soft blur-[120px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-orange-600/10 blur-[110px]" />

        <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-14">
          <div className="min-w-0 space-y-8">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface-elevated/90 px-4 py-2 text-sm font-bold text-muted-body shadow-sm backdrop-blur-md">
                <Sparkles className="h-4 w-4 text-accent-strong" aria-hidden /> {t("hero.badge")}
              </span>
              <h1 className="text-balance text-4xl font-black leading-[1.08] tracking-tight text-foreground md:text-6xl lg:text-7xl">
                {t("hero.titleLine1")} <br />
                <span className="mt-1 block text-orange-600 dark:text-orange-300 md:mt-0 md:inline">
                  <RotatorText />
                </span>
              </h1>
              <p className="max-w-xl text-lg font-medium leading-relaxed text-muted-body md:text-xl">{t("hero.description")}</p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button size="lg" className="h-14 gap-2 rounded-2xl px-10 text-base font-black shadow-xl" asChild>
                <Link href={`${PRIMARY_CTA}_hero`} onClick={() => trackTrialClick("hero")}>
                  {tp1("cta.startTrial")} <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="h-14 rounded-2xl border-border/90 px-8 text-base font-bold" asChild>
                <Link href={SECONDARY_CTA} onClick={() => trackDemoClick("hero")}>
                  {tp1("cta.exploreDemo")}
                </Link>
              </Button>
            </div>

            <div className="space-y-6">
              <p className="text-sm font-semibold text-muted-body">No credit card required • 15-day trial • Guided onboarding included</p>
              <SocialProofHero />
            </div>
          </div>

          <div className="min-w-0 lg:pt-2">
            <HeroRevenueLoopVisual />
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface-base py-16">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-3">
          {outcomePillars.map((item) => (
            <article key={item.title} className="rounded-2xl border border-border/80 bg-surface-elevated p-6 shadow-sm">
              <item.icon className="mb-3 h-5 w-5 text-orange-500" />
              <h2 className="text-xl font-black tracking-tight text-foreground">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-body">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden border-b border-border py-12">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-8 text-center text-sm font-bold uppercase tracking-[0.2em] text-muted-body">{tp1("trustHeadline")}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {trustMetrics.map((metric, idx) => (
              <motion.div key={metric.label} initial={reduceMotion ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.28, delay: reduceMotion ? 0 : idx * 0.06 }} className="rounded-2xl border border-border/80 bg-surface-elevated px-5 py-4 shadow-sm">
                <div className="mb-2 inline-flex rounded-lg bg-orange-500/10 p-2 text-orange-600 dark:text-orange-400"><metric.icon className="h-4 w-4" strokeWidth={2.25} /></div>
                <p className="text-2xl font-black text-foreground">{metric.value}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-muted-body">{metric.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div id="demo-launcher">
        <RoleDemoLauncher />
      </div>
      <ComparisonTable />
      <PricingSection />
      <FreeVsProComparison />

      <section className="relative overflow-hidden bg-foreground py-28">
        <div className="pointer-events-none absolute right-0 top-0 h-[600px] w-[600px] rounded-full bg-accent-strong/25 blur-[120px]" />
        <motion.div initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: 0.45 }} className="relative z-10 mx-auto max-w-4xl space-y-10 px-6 text-center">
          <h2 className="text-4xl font-black leading-tight tracking-tight text-white md:text-6xl">{t("finalCta.titleLine1")} <br /><span className="text-accent-strong">{t("finalCta.titleLine2")}</span></h2>
          <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
            <Button size="lg" className="h-14 rounded-2xl bg-surface-elevated px-10 text-lg font-black text-foreground shadow-xl hover:bg-white" asChild>
              <Link href={`${PRIMARY_CTA}_final`} onClick={() => trackTrialClick("final_cta")}>{tp1("cta.startTrial")}</Link>
            </Button>
            <Button size="lg" variant="outline" className="h-14 rounded-2xl border-white/25 bg-transparent px-10 text-lg font-bold text-white hover:bg-white/10" asChild>
              <Link href={SECONDARY_CTA} onClick={() => trackDemoClick("final_cta")}>{tp1("cta.exploreDemo")}</Link>
            </Button>
          </div>
          <div className="flex flex-wrap justify-center gap-8 pt-4 text-xs font-bold uppercase tracking-widest text-white/70">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /> {t("finalCta.badges.udyam")}</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent-strong" /> {t("finalCta.badges.wcag")}</div>
            <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-orange-400" /> {t("finalCta.badges.globalSupport")}</div>
          </div>
        </motion.div>
      </section>

      <LandingFooter />
      <FloatingPreferencesWidget />
    </div>
  );
}
