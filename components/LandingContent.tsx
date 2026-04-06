"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  Globe, 
  Sparkles, 
  Box, 
  Receipt, 
  Users, 
  FileSignature, 
  BarChart3,
  Landmark,
  CheckCircle2,
  Calculator
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import LandingNavbar from "@/components/LandingNavbar";
import ComparisonTable from "@/components/ComparisonTable";
import PricingSection from "@/components/PricingSection";
import LandingFooter from "@/components/LandingFooter";

export default function LandingContent() {
  const t = useTranslations("Landing");
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95]);

  const features = [
    {
      title: t("features.items.automatedInvoicing.title"),
      description: t("features.items.automatedInvoicing.description"),
      icon: Receipt,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-950/20",
    },
    {
      title: t("features.items.zeroEffortRetainers.title"),
      description: t("features.items.zeroEffortRetainers.description"),
      icon: Zap,
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-950/20",
    },
    {
      title: t("features.items.aiBabaBotInsights.title"),
      description: t("features.items.aiBabaBotInsights.description"),
      icon: Sparkles,
      color: "text-indigo-500",
      bg: "bg-indigo-50 dark:bg-indigo-950/20",
    },
    {
      title: t("features.items.expenseLedger.title"),
      description: t("features.items.expenseLedger.description"),
      icon: BarChart3,
      color: "text-rose-500",
      bg: "bg-rose-50 dark:bg-rose-950/20",
    },
    {
      title: t("features.items.bankReconciliation.title"),
      description: t("features.items.bankReconciliation.description"),
      icon: Landmark,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-950/20",
    },
    {
      title: t("features.items.investmentHub.title"),
      description: t("features.items.investmentHub.description"),
      icon: Calculator,
      color: "text-violet-500",
      bg: "bg-violet-50 dark:bg-violet-950/20",
    },
    {
        title: t("features.items.globalCompliance.title"),
        description: t("features.items.globalCompliance.description"),
        icon: Globe,
        color: "text-emerald-500",
        bg: "bg-emerald-50 dark:bg-emerald-950/20",
      },
      {
        title: t("features.items.clientCrm.title"),
        description: t("features.items.clientCrm.description"),
        icon: Users,
        color: "text-sky-500",
        bg: "bg-sky-50 dark:bg-sky-950/20",
      },
      {
        title: t("features.items.premiumProposals.title"),
        description: t("features.items.premiumProposals.description"),
        icon: FileSignature,
        color: "text-indigo-500",
        bg: "bg-indigo-50 dark:bg-indigo-950/20",
      },
  ];

  return (
    <div className="bg-surface-base overflow-x-hidden">
      <LandingNavbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-accent-soft blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-violet-600/5 blur-[100px] rounded-full pointer-events-none" />

        <motion.div 
          style={{ opacity, scale }}
          className="max-w-5xl mx-auto text-center space-y-8 z-10"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-elevated border border-border text-sm font-bold text-muted-body mb-6">
              <Sparkles className="w-4 h-4 text-accent-strong" /> {t("hero.badge")}
            </span>
            <h1 className="text-6xl md:text-8xl font-black tracking-tight text-foreground leading-[1.05]">
              {t("hero.titleLine1")} <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500">
                {t("hero.titleLine2")}
              </span>
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl md:text-2xl text-muted-body max-w-3xl mx-auto leading-relaxed font-medium"
          >
            {t("hero.description")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
          >
            <Button size="lg" className="btn-primary h-16 px-10 rounded-2xl text-lg gap-2 group" asChild>
              <Link href="/api/auth/signin">
                {t("hero.primaryCta")} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button variant="ghost" size="lg" className="h-16 px-10 text-muted-body hover:text-foreground font-bold text-lg" asChild>
              <Link href="#features">{t("hero.secondaryCta")}</Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 60 }}
            transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
            className="card-elevated relative mt-20 mx-auto max-w-6xl aspect-[16/9] rounded-3xl overflow-hidden"
          >
             <div className="absolute inset-0 bg-gradient-to-b from-transparent to-zinc-900/50" />
             <div className="absolute top-4 left-4 flex gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500" />
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
             </div>
             <div className="flex flex-col items-center justify-center h-full space-y-6">
                <div className="w-16 h-16 bg-accent-strong rounded-2xl flex items-center justify-center animate-bounce shadow-xl">
                  <Box className="w-8 h-8 text-white" />
                </div>
                <p className="text-muted-body font-medium tracking-widest uppercase text-sm">{t("hero.dashboardPreview")}</p>
             </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Trust Badges */}
      <section className="py-12 border-y border-border">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-sm font-bold text-muted-body uppercase tracking-[0.2em] mb-8">{t("trust.title")}</p>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-50 grayscale contrast-125">
             <span className="text-2xl font-black text-foreground">{t("trust.cities.dubai")}</span>
             <span className="text-2xl font-black text-foreground">{t("trust.cities.london")}</span>
             <span className="text-2xl font-black text-foreground">{t("trust.cities.singapore")}</span>
             <span className="text-2xl font-black text-foreground">{t("trust.cities.newYork")}</span>
             <span className="text-2xl font-black text-foreground">{t("trust.cities.newDelhi")}</span>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="py-32 bg-surface-base">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-3xl space-y-4 mb-20 text-left">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-foreground">
              {t("features.headingPrefix")} <span className="text-indigo-600">{t("features.headingHighlight")}</span>
            </h2>
            <p className="text-lg text-muted-body leading-relaxed font-medium">
              {t("features.description")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="card-elevated group p-8 rounded-3xl hover:border-accent-strong/50 hover:shadow-2xl transition-all"
              >
                <div className={`w-14 h-14 rounded-2xl ${feature.bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className={`w-7 h-7 ${feature.color}`} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">{feature.title}</h3>
                <p className="text-muted-body leading-relaxed font-medium">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <ComparisonTable />
      <PricingSection />

      {/* Final CTA */}
      <section className="py-32 bg-foreground relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent-strong/30 blur-[120px] rounded-full" />
        <div className="max-w-4xl mx-auto px-6 text-center space-y-12 z-10 relative">
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-tight">
            {t("finalCta.titleLine1")} <br />
            <span className="text-accent-strong">{t("finalCta.titleLine2")}</span>
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Button size="lg" className="h-16 px-12 bg-surface-elevated text-foreground hover:bg-surface-base rounded-2xl font-black text-xl shadow-2xl active:scale-95" asChild>
               <Link href="/api/auth/signin">{t("finalCta.primaryCta")}</Link>
            </Button>
            <Button size="lg" className="h-16 px-12 bg-transparent border border-white/20 text-white hover:bg-white/10 rounded-2xl font-bold text-xl transition-all" asChild>
               <Link href="/help">{t("finalCta.secondaryCta")}</Link>
            </Button>
          </div>
          <div className="pt-8 flex flex-wrap justify-center gap-8 text-white/65 font-bold uppercase tracking-widest text-xs">
             <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" /> {t("finalCta.badges.udyam")}
             </div>
             <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent-strong" /> {t("finalCta.badges.wcag")}
             </div>
             <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" /> {t("finalCta.badges.globalSupport")}
             </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
