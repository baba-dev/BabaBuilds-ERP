"use client";

import { m, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Globe,
  CheckCircle2,
  MapPin,
  Workflow,
  Percent,
  Coins,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import LandingNavbar from "@/components/LandingNavbar";
import ComparisonTable from "@/components/ComparisonTable";
import PricingSection from "@/components/PricingSection";
import LandingFooter from "@/components/LandingFooter";
import { cn } from "@/lib/utils";

import RotatorText from "@/components/landing/RotatorText";
import RoleDemoLauncher from "@/components/landing/RoleDemoLauncher";
import { personaNavigationLinks } from "@/components/landing/persona/persona-config";
import { emitMarketingAnalyticsEvent } from "@/lib/marketing-analytics";
import HeroRevenueLoopVisual from "@/components/landing/HeroRevenueLoopVisual";
import LandingStorySteps from "@/components/landing/LandingStorySteps";
import LandingFeaturePillars from "@/components/landing/LandingFeaturePillars";
import LandingPersonaHub from "@/components/landing/LandingPersonaHub";
import FloatingPreferencesWidget from "@/components/landing/FloatingPreferencesWidget";
import SocialProofHero from "@/components/landing/SocialProofHero";

export default function LandingContent() {
  const t = useTranslations("Landing");
  const tp1 = useTranslations("LandingPhase1");
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2], [1, 0.98]);

  const trustCities = [
    t("trust.cities.dubai"),
    t("trust.cities.london"),
    t("trust.cities.singapore"),
    t("trust.cities.newYork"),
    t("trust.cities.newDelhi"),
  ];
  const trustMetrics = [
    { label: tp1("trustMetrics.automationsEnabled"), value: t("trustMetricValues.automations"), icon: Workflow },
    { label: tp1("trustMetrics.invoiceSuccessRate"), value: t("trustMetricValues.invoiceRate"), icon: Percent },
    { label: tp1("trustMetrics.supportedCurrencies"), value: t("trustMetricValues.currencies"), icon: Coins },
    { label: tp1("trustMetrics.avgSetupTime"), value: t("trustMetricValues.setupTime"), icon: Timer },
  ];
  const regionalReadiness = [
    t("regionalReadiness.signals.vat"),
    t("regionalReadiness.signals.remittance"),
    t("regionalReadiness.signals.arabic"),
  ];
  const trustChips = [
    tp1("trustChips.secureBilling"),
    tp1("trustChips.taxWorkflows"),
    tp1("trustChips.gstVat"),
    tp1("trustChips.proposalsInvoicing"),
    tp1("trustChips.multiCurrency"),
  ];
  const trackTrialClick = (surface: string) => {
    emitMarketingAnalyticsEvent("marketing_trial_cta_clicked", {
      location: surface,
      label: tp1("cta.startTrial"),
    });
  };
  const trackDemoClick = (surface: string) => {
    emitMarketingAnalyticsEvent("marketing_cta_click", {
      location: surface,
      label: tp1("cta.exploreDemo"),
      href: "#demo-launcher",
    });
  };

  return (
    <div className="overflow-x-hidden bg-surface-base">
      <LandingNavbar />

      <section className="relative min-h-[min(100vh,920px)] px-6 pb-16 pt-28 md:pt-32">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-accent-soft blur-[120px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-orange-600/10 blur-[110px]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.02] mix-blend-overlay dark:opacity-[0.04]"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=0 0 200 200 xmlns=http://www.w3.org/2000/svg%3E%3Cfilter id=noiseFilter%3E%3CfeTurbulence type=fractalNoise baseFrequency=0.65 numOctaves=3 stitchTiles=stitch/%3E%3C/filter%3E%3Crect width=100%25 height=100%25 filter=url(%23noiseFilter)/%3E%3C/svg%3E")',
          }}
        />

        <m.div
          style={reduceMotion ? undefined : { opacity, scale }}
          className="relative z-10 mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14"
        >
          <div className="space-y-8">
            <m.div
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-6"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface-elevated/90 px-4 py-2 text-sm font-bold text-muted-body shadow-sm backdrop-blur-md">
                <Sparkles className="h-4 w-4 text-accent-strong" /> {t("hero.badge")}
              </span>
              <h1 className="text-4xl font-black leading-[1.08] tracking-tight text-foreground md:text-6xl lg:text-7xl">
                {t("hero.titleLine1")} <br />
                <RotatorText />
              </h1>
              <p className="max-w-xl text-lg font-medium leading-relaxed text-muted-body md:text-xl">
                {t("hero.description")}
              </p>
            </m.div>

            <m.div
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.12 }}
              className="flex flex-col gap-4 sm:flex-row sm:items-center"
            >
              <div className="relative group">
                <div className="absolute -inset-0.5 animate-pulse rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 opacity-25 blur transition duration-500 group-hover:opacity-40" />
                <Button
                  size="lg"
                  className="relative h-14 gap-2 rounded-2xl px-10 text-base font-black shadow-xl"
                  asChild
                >
                  <Link href="/api/auth/signin" onClick={() => trackTrialClick("hero")}>
                    {tp1("cta.startTrial")} <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
              </div>
              <Button
                variant="outline"
                size="lg"
                className="h-14 rounded-2xl border-border/90 px-8 text-base font-bold"
                asChild
              >
                <Link href="#demo-launcher" onClick={() => trackDemoClick("hero")}>
                  {tp1("cta.exploreDemo")}
                </Link>
              </Button>
            </m.div>

            <SocialProofHero />

            <m.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="flex flex-wrap gap-2 pt-1"
            >
              {trustChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-border/80 bg-surface-elevated px-3 py-1 text-xs font-semibold text-muted-body"
                >
                  {chip}
                </span>
              ))}
            </m.div>
          </div>

          <HeroRevenueLoopVisual />
        </m.div>
      </section>

      <LandingStorySteps />

      <section className="border-b border-border/80 bg-surface-base py-14">
        <div className="mx-auto max-w-7xl px-6">
          <motion.blockquote
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.4 }}
            className="mx-auto max-w-3xl text-center"
          >
            <p className="text-lg font-medium italic leading-relaxed text-foreground/95 md:text-xl">
              &ldquo;{t("socialProof.quote")}&rdquo;
            </p>
            <footer className="mt-4 text-sm font-bold text-muted-body">
              <span className="text-foreground">{t("socialProof.attribution")}</span>
              <span className="mx-2 text-orange-500">·</span>
              <span>{t("socialProof.role")}</span>
            </footer>
          </motion.blockquote>
        </div>
      </section>

      <section className="overflow-hidden border-y border-border py-12">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-8 text-center text-sm font-bold uppercase tracking-[0.2em] text-muted-body">{t("trust.title")}</p>
          <div className="grid gap-4 md:grid-cols-5">
            {trustCities.map((city, idx) => (
              <m.div
                key={city}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.24, delay: reduceMotion ? 0 : idx * 0.05 }}
                className="flex items-center justify-center gap-2 rounded-2xl border border-border/80 bg-surface-elevated px-4 py-3 text-center text-sm font-bold tracking-wide text-foreground/85 shadow-sm md:text-base"
              >
                <MapPin className="h-4 w-4 shrink-0 text-orange-500/80" aria-hidden />
                {city}
              </m.div>
            ))}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {trustMetrics.map((metric, idx) => (
              <m.div
                key={metric.label}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.28, delay: reduceMotion ? 0 : idx * 0.06 }}
                className="rounded-2xl border border-border/80 bg-surface-elevated px-5 py-4 shadow-sm"
              >
                <div className="mb-2 inline-flex rounded-lg bg-orange-500/10 p-2 text-orange-600 dark:text-orange-400">
                  <metric.icon className="h-4 w-4" strokeWidth={2.25} />
                </div>
                <p className="text-2xl font-black text-foreground">{metric.value}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-muted-body">{metric.label}</p>
              </m.div>
            ))}
          </div>
          <m.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.35 }}
            className="mt-8 rounded-2xl border border-border/80 bg-surface-elevated px-6 py-5 shadow-sm"
          >
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-body">{t("regionalReadiness.title")}</p>
            <p className="mt-2 text-sm text-muted-body">{t("regionalReadiness.subtitle")}</p>
            <ul className="mt-4 space-y-2">
              {regionalReadiness.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground/90">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </m.div>
        </div>
      </section>

      <section id="demo-launcher">
        <RoleDemoLauncher />
      </section>

      <LandingFeaturePillars />

      <ComparisonTable />

      <PricingSection />

      <LandingPersonaHub />

      <section className="bg-surface-base py-12">
        <div className="mx-auto max-w-7xl px-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-body">{tp1("exploreByPersona")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {personaNavigationLinks.map((persona) => (
              <Link
                key={persona.href}
                href={persona.href}
                className="rounded-xl border border-border/80 bg-surface-elevated px-4 py-2 text-sm font-semibold text-foreground/90 transition hover:border-orange-500/40 hover:text-orange-600 dark:hover:text-orange-400"
              >
                {persona.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-foreground py-28">
        <div className="pointer-events-none absolute right-0 top-0 h-[600px] w-[600px] rounded-full bg-accent-strong/25 blur-[120px]" />
        <m.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.45 }}
          className="relative z-10 mx-auto max-w-4xl space-y-10 px-6 text-center"
        >
          <h2 className="text-4xl font-black leading-tight tracking-tight text-white md:text-6xl">
            {t("finalCta.titleLine1")} <br />
            <span className="text-accent-strong">{t("finalCta.titleLine2")}</span>
          </h2>
          <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
            <Button
              size="lg"
              className="h-14 rounded-2xl bg-surface-elevated px-10 text-lg font-black text-foreground shadow-xl hover:bg-white"
              asChild
            >
              <Link href="/api/auth/signin" onClick={() => trackTrialClick("final_cta")}>
                {tp1("cta.startTrial")}
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 rounded-2xl border-white/25 bg-transparent px-10 text-lg font-bold text-white hover:bg-white/10"
              asChild
            >
              <Link href="#demo-launcher" onClick={() => trackDemoClick("final_cta")}>
                {tp1("cta.exploreDemo")}
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap justify-center gap-8 pt-4 text-xs font-bold uppercase tracking-widest text-white/70">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> {t("finalCta.badges.udyam")}
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-accent-strong" /> {t("finalCta.badges.wcag")}
            </div>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-orange-400" /> {t("finalCta.badges.globalSupport")}
            </div>
          </div>
        </m.div>
      </section>

      <LandingFooter />
      <FloatingPreferencesWidget />
    </div>
  );
}
