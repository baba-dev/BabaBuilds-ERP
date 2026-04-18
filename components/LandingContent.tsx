"use client";

import { LazyMotion, domAnimation, m, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe,
  Sparkles,
  Receipt,
  Users,
  FileSignature,
  BarChart3,
  Landmark,
  CheckCircle2,
  Calculator,
  Package,
  Store,
  BellRing,
  Shield,
  UsersRound,
  MonitorSmartphone,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import LandingNavbar from "@/components/LandingNavbar";
import ComparisonTable from "@/components/ComparisonTable";
import PricingSection from "@/components/PricingSection";
import LandingFooter from "@/components/LandingFooter";
import { cn } from "@/lib/utils";

import HeroMotionDecor from "@/components/landing/HeroMotionDecor";
import SocialProofHero from "@/components/landing/SocialProofHero";
import RotatorText from "@/components/landing/RotatorText";
import AnimatedChartDecor from "@/components/landing/AnimatedChartDecor";

export default function LandingContent() {
  const t = useTranslations("Landing");
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2], [1, 0.96]);

  const trustCities = [
    t("trust.cities.dubai"),
    t("trust.cities.london"),
    t("trust.cities.singapore"),
    t("trust.cities.newYork"),
    t("trust.cities.newDelhi"),
  ];
  const trustMetrics = [
    { label: "Automations enabled", value: "120+" },
    { label: "Invoice success rate", value: "99.9%" },
    { label: "Supported currencies", value: "25+" },
    { label: "Avg. setup time", value: "< 15 min" },
  ];

  const features = [
    {
      title: t("features.items.automatedInvoicing.title"),
      description: t("features.items.automatedInvoicing.description"),
      icon: Receipt,
      color: "text-orange-500",
      bg: "bg-orange-50 dark:bg-orange-950/30",
      span: "lg:col-span-2 lg:row-span-2",
      priority: "Built for velocity",
    },
    {
      title: t("features.items.zeroEffortRetainers.title"),
      description: t("features.items.zeroEffortRetainers.description"),
      icon: Zap,
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      span: "lg:col-span-1",
      priority: "Automation",
    },
    {
      title: t("features.items.aiBabaBotInsights.title"),
      description: t("features.items.aiBabaBotInsights.description"),
      icon: Sparkles,
      color: "text-amber-600",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      span: "lg:col-span-1",
      priority: "Intelligence",
    },
    {
      title: t("features.items.expenseLedger.title"),
      description: t("features.items.expenseLedger.description"),
      icon: BarChart3,
      color: "text-rose-500",
      bg: "bg-rose-50 dark:bg-rose-950/30",
      span: "lg:col-span-1",
      priority: "Control",
    },
    {
      title: t("features.items.bankReconciliation.title"),
      description: t("features.items.bankReconciliation.description"),
      icon: Landmark,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      span: "lg:col-span-1",
      priority: "Confidence",
    },
    {
      title: t("features.items.investmentHub.title"),
      description: t("features.items.investmentHub.description"),
      icon: Calculator,
      color: "text-amber-700",
      bg: "bg-amber-100/80 dark:bg-amber-950/30",
      span: "lg:col-span-1",
      priority: "Forecasting",
    },
    {
      title: t("features.items.globalCompliance.title"),
      description: t("features.items.globalCompliance.description"),
      icon: Globe,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      span: "lg:col-span-1",
      priority: "Global",
    },
    {
      title: t("features.items.clientCrm.title"),
      description: t("features.items.clientCrm.description"),
      icon: Users,
      color: "text-orange-700",
      bg: "bg-orange-100/80 dark:bg-orange-950/25",
      span: "lg:col-span-1",
      priority: "Relationships",
    },
    {
      title: t("features.items.premiumProposals.title"),
      description: t("features.items.premiumProposals.description"),
      icon: FileSignature,
      color: "text-orange-600",
      bg: "bg-orange-50 dark:bg-orange-950/30",
      span: "lg:col-span-1",
      priority: "Conversion",
    },
    {
      title: t("features.items.inventoryHub.title"),
      description: t("features.items.inventoryHub.description"),
      icon: Package,
      color: "text-amber-600",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      span: "lg:col-span-1",
      priority: "Logistics",
    },
    {
      title: t("features.items.storeCatalog.title"),
      description: t("features.items.storeCatalog.description"),
      icon: Store,
      color: "text-pink-500",
      bg: "bg-pink-50 dark:bg-pink-950/30",
      span: "lg:col-span-1",
      priority: "Commerce",
    },
    {
      title: t("features.items.multiChannelNotifications.title"),
      description: t("features.items.multiChannelNotifications.description"),
      icon: BellRing,
      color: "text-yellow-500",
      bg: "bg-yellow-50 dark:bg-yellow-950/30",
      span: "lg:col-span-1",
      priority: "Alerts",
    },
    {
      title: t("features.items.caCompliance.title"),
      description: t("features.items.caCompliance.description"),
      icon: Shield,
      color: "text-teal-500",
      bg: "bg-teal-50 dark:bg-teal-950/30",
      span: "lg:col-span-1",
      priority: "Auditing",
    },
    {
      title: t("features.items.multiLevelRoles.title"),
      description: t("features.items.multiLevelRoles.description"),
      icon: UsersRound,
      color: "text-orange-700",
      bg: "bg-orange-100/70 dark:bg-orange-950/25",
      span: "lg:col-span-1",
      priority: "Security",
    },
    {
      title: t("features.items.pwaImplementation.title"),
      description: t("features.items.pwaImplementation.description"),
      icon: MonitorSmartphone,
      color: "text-amber-700",
      bg: "bg-amber-100/70 dark:bg-amber-950/25",
      span: "lg:col-span-1",
      priority: "Offline",
    },
    {
      title: t("features.items.nativeApps.title"),
      description: t("features.items.nativeApps.description"),
      icon: MonitorSmartphone,
      color: "text-green-500",
      bg: "bg-green-50 dark:bg-green-950/30",
      span: "lg:col-span-2",
      priority: "Mobile",
    },
  ];

  return (
    <div className="overflow-x-hidden bg-surface-base">
      <LandingNavbar />

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 pt-32 pb-20">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-accent-soft blur-[120px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-orange-600/10 blur-[110px]" />
        
        {/* Floating background noise/grid for dark mode texture */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.02] mix-blend-overlay dark:opacity-[0.04]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=0 0 200 200 xmlns=http://www.w3.org/2000/svg%3E%3Cfilter id=noiseFilter%3E%3CfeTurbulence type=fractalNoise baseFrequency=0.65 numOctaves=3 stitchTiles=stitch/%3E%3C/filter%3E%3Crect width=100%25 height=100%25 filter=url(%23noiseFilter)/%3E%3C/svg%3E")' }} />

        <AnimatedChartDecor />

        <motion.div
          style={reduceMotion ? undefined : { opacity, scale }}
          className="z-10 mx-auto max-w-5xl space-y-10 text-center relative"
        >
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface-elevated/80 backdrop-blur-md px-5 py-2 text-sm font-bold text-muted-body shadow-sm">
              <Sparkles className="h-4 w-4 text-accent-strong" /> {t("hero.badge")}
            </span>
            <h1 className="text-5xl font-black leading-[1.1] tracking-tight text-foreground md:text-8xl">
              {t("hero.titleLine1")} <br />
              <RotatorText />
            </h1>
          </motion.div>

          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 }}
            className="mx-auto max-w-3xl text-xl font-medium leading-relaxed text-muted-body md:text-2xl"
          >
            {t("hero.description")}
          </motion.p>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="flex flex-col items-center justify-center gap-5 pt-6 sm:flex-row"
          >
            {/* Enhanced glowing primary CTA button */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
              <Button size="lg" className="relative btn-primary h-16 gap-2 rounded-2xl px-12 text-lg font-black shadow-2xl transition-all" asChild>
                <Link href="/api/auth/signin">
                  {t("hero.primaryCta")} <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
            <Button variant="ghost" size="lg" className="h-16 px-10 text-lg font-bold text-muted-body hover:bg-surface-elevated hover:text-foreground transition-colors rounded-2xl" asChild>
              <Link href="#features">{t("hero.secondaryCta")}</Link>
            </Button>
          </motion.div>

          <SocialProofHero />

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, type: "spring", stiffness: 40 }}
            className="card-elevated relative mx-auto mt-20 aspect-[16/9] max-w-6xl overflow-hidden rounded-[2.5rem] border-white/20 dark:border-white/10 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.5)]"
          >
            <HeroMotionDecor />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface-base/80" />
            <div className="absolute left-6 top-6 flex gap-2">
              <div className="h-3.5 w-3.5 rounded-full bg-rose-500 shadow-sm" />
              <div className="h-3.5 w-3.5 rounded-full bg-amber-500 shadow-sm" />
              <div className="h-3.5 w-3.5 rounded-full bg-emerald-500 shadow-sm" />
            </div>
            <div className="relative flex h-full flex-col items-center justify-center space-y-6">
              <div className="grid h-24 w-24 place-items-center rounded-3xl border border-white/20 bg-white/10 shadow-[0_0_50px_rgba(255,255,255,0.1)] backdrop-blur-md dark:bg-white/5">
                <Sparkles className="h-12 w-12 text-white drop-shadow-xl" />
              </div>
              <p className="text-sm font-black uppercase tracking-[0.25em] text-zinc-100 drop-shadow-md">
                {t("hero.dashboardPreview")}
              </p>
            </div>
          </motion.div>
        </motion.div>
      </section>

      <section className="overflow-hidden border-y border-border py-12">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-8 text-center text-sm font-bold uppercase tracking-[0.2em] text-muted-body">{t("trust.title")}</p>
          <div className="grid gap-4 md:grid-cols-5">
            {trustCities.map((city, idx) => (
              <motion.div
                key={city}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.24, delay: reduceMotion ? 0 : idx * 0.05 }}
                className="rounded-2xl border border-border/80 bg-surface-elevated px-5 py-3 text-center text-sm font-bold tracking-wide text-foreground/85 shadow-sm md:text-base"
              >
                {city}
              </motion.div>
            ))}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {trustMetrics.map((metric, idx) => (
              <motion.div
                key={metric.label}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.28, delay: reduceMotion ? 0 : idx * 0.06 }}
                className="rounded-2xl border border-border/80 bg-surface-elevated px-5 py-4 shadow-sm"
              >
                <p className="text-2xl font-black text-foreground">{metric.value}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-muted-body">{metric.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="bg-surface-base py-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-20 max-w-3xl space-y-4 text-left">
            <h2 className="text-3xl font-black tracking-tight text-foreground md:text-5xl">
              {t("features.headingPrefix")} <span className="text-orange-600">{t("features.headingHighlight")}</span>
            </h2>
            <p className="text-lg font-medium leading-relaxed text-muted-body">{t("features.description")}</p>
          </div>

          <LazyMotion features={domAnimation}>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[minmax(190px,auto)]">
              {features.map((feature, idx) => (
                <m.div
                  key={feature.title}
                  initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ delay: reduceMotion ? 0 : idx * 0.06, duration: 0.32 }}
                  className={cn(
                    "card-elevated group relative overflow-hidden rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1 hover:border-accent-strong/45 hover:shadow-2xl",
                    feature.span,
                  )}
                >
                  <div className="mb-6 flex items-center justify-between gap-4">
                    <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl", feature.bg)}>
                      <feature.icon className={cn("h-7 w-7", feature.color)} />
                    </div>
                    <span className="rounded-full border border-border/80 bg-surface-base px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-body">
                      {feature.priority}
                    </span>
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-foreground">{feature.title}</h3>
                  <p className="font-medium leading-relaxed text-muted-body">{feature.description}</p>
                </m.div>
              ))}
            </div>
          </LazyMotion>
        </div>
      </section>

      <ComparisonTable />
      <PricingSection />

      <section className="relative overflow-hidden bg-foreground py-32">
        <div className="absolute right-0 top-0 h-[600px] w-[600px] rounded-full bg-accent-strong/30 blur-[120px]" />
        <div className="relative z-10 mx-auto max-w-4xl space-y-12 px-6 text-center">
          <h2 className="text-4xl font-black leading-tight tracking-tight text-white md:text-6xl">
            {t("finalCta.titleLine1")} <br />
            <span className="text-accent-strong">{t("finalCta.titleLine2")}</span>
          </h2>
          <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
            <Button size="lg" className="h-16 rounded-2xl bg-surface-elevated px-12 text-xl font-black text-foreground shadow-2xl hover:bg-surface-base active:scale-95" asChild>
              <Link href="/api/auth/signin">{t("finalCta.primaryCta")}</Link>
            </Button>
            <Button size="lg" className="h-16 rounded-2xl border border-white/20 bg-transparent px-12 text-xl font-bold text-white transition-all hover:bg-white/10" asChild>
              <Link href="/help">{t("finalCta.secondaryCta")}</Link>
            </Button>
          </div>
          <div className="flex flex-wrap justify-center gap-8 pt-8 text-xs font-bold uppercase tracking-widest text-white/70">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> {t("finalCta.badges.udyam")}
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-accent-strong" /> {t("finalCta.badges.wcag")}
            </div>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-orange-500" /> {t("finalCta.badges.globalSupport")}
            </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
