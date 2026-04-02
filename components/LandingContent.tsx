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
import { Button } from "@/components/ui/button";
import LandingNavbar from "@/components/LandingNavbar";
import ComparisonTable from "@/components/ComparisonTable";
import PricingSection from "@/components/PricingSection";
import LandingFooter from "@/components/LandingFooter";

export default function LandingContent() {
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95]);

  const features = [
    {
      title: "Automated Invoicing",
      description: "Generates professional PDFs with multi-theme support and automatic calculation of taxes.",
      icon: Receipt,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-950/20",
    },
    {
      title: "Zero-Effort Retainers",
      description: "Set recurring billing once. Our engine auto-appends dates and descriptions every month.",
      icon: Zap,
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-950/20",
    },
    {
      title: "AI BabaBot Insights",
      description: "Chat with your data. Get instant financial summaries and trend analysis using natural language.",
      icon: Sparkles,
      color: "text-indigo-500",
      bg: "bg-indigo-50 dark:bg-indigo-950/20",
    },
    {
      title: "Expense Ledger",
      description: "Track every cent with automated categorization and secure receipt storage.",
      icon: BarChart3,
      color: "text-rose-500",
      bg: "bg-rose-50 dark:bg-rose-950/20",
    },
    {
      title: "Bank Reconciliation",
      description: "One-click matching of bank statements to invoices and expenses for 100% accuracy.",
      icon: Landmark,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-950/20",
    },
    {
      title: "Investment Hub",
      description: "Global oversight of your agency's wealth, investments, and growth metrics.",
      icon: Calculator,
      color: "text-violet-500",
      bg: "bg-violet-50 dark:bg-violet-950/20",
    },
    {
        title: "Global Compliance",
        description: "Built-in SAC/HSN code lookup and regional tax compliance for 40+ countries.",
        icon: Globe,
        color: "text-emerald-500",
        bg: "bg-emerald-50 dark:bg-emerald-950/20",
      },
      {
        title: "Client CRM",
        description: "Manage relationships, track statuses, and view complete billing histories in one hub.",
        icon: Users,
        color: "text-sky-500",
        bg: "bg-sky-50 dark:bg-sky-950/20",
      },
      {
        title: "Premium Proposals",
        description: "High-converting proposal links with integrated e-signatures and public tracking.",
        icon: FileSignature,
        color: "text-indigo-500",
        bg: "bg-indigo-50 dark:bg-indigo-950/20",
      },
  ];

  return (
    <div className="bg-white dark:bg-zinc-950 overflow-x-hidden">
      <LandingNavbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
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
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-6">
              <Sparkles className="w-4 h-4 text-indigo-500" /> Introducing the Next Evolution of ERP
            </span>
            <h1 className="text-6xl md:text-8xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.05]">
              Run Your Agency <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500">
                on Autopilot.
              </span>
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 max-w-3xl mx-auto leading-relaxed font-medium"
          >
            The global command center for bookkeeping, compliance, and growth. 
            Automate your invoices, reconcile bank feeds, and let AI reveal your financial truth.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
          >
            <Button size="lg" className="h-16 px-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-2xl shadow-indigo-500/20 text-lg font-bold gap-2 group transition-all active:scale-95" asChild>
              <Link href="/api/auth/signin">
                Start for Free <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button variant="ghost" size="lg" className="h-16 px-10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-bold text-lg" asChild>
              <Link href="#features">See all Features</Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 60 }}
            transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
            className="relative mt-20 mx-auto max-w-6xl aspect-[16/9] rounded-3xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-[0_0_100px_rgba(0,0,0,0.1)] dark:shadow-[0_0_100px_rgba(0,0,0,0.5)]"
          >
             <div className="absolute inset-0 bg-gradient-to-b from-transparent to-zinc-900/50" />
             <div className="absolute top-4 left-4 flex gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500" />
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
             </div>
             <div className="flex flex-col items-center justify-center h-full space-y-6">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center animate-bounce shadow-xl shadow-indigo-500/50">
                  <Box className="w-8 h-8 text-white" />
                </div>
                <p className="text-zinc-400 font-medium tracking-widest uppercase text-sm">Dashboard Preview</p>
             </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Trust Badges */}
      <section className="py-12 border-y border-zinc-100 dark:border-zinc-900">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-sm font-bold text-zinc-400 uppercase tracking-[0.2em] mb-8">Trusted by Modern Agencies in</p>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-50 grayscale contrast-125">
             <span className="text-2xl font-black text-zinc-900 dark:text-zinc-50">Dubai</span>
             <span className="text-2xl font-black text-zinc-900 dark:text-zinc-50">London</span>
             <span className="text-2xl font-black text-zinc-900 dark:text-zinc-50">Singapore</span>
             <span className="text-2xl font-black text-zinc-900 dark:text-zinc-50">New York</span>
             <span className="text-2xl font-black text-zinc-900 dark:text-zinc-50">New Delhi</span>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="py-32 bg-white dark:bg-zinc-950">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-3xl space-y-4 mb-20 text-left">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              Everything you need to <span className="text-indigo-600">scale with speed.</span>
            </h2>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
              We've automated the boring bits so you can focus on building your empire. 
              No more manual reconciliation or missing tax deadlines.
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
                className="group p-8 rounded-3xl border border-zinc-100 dark:border-zinc-900 hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all bg-white dark:bg-zinc-900/50"
              >
                <div className={`w-14 h-14 rounded-2xl ${feature.bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className={`w-7 h-7 ${feature.color}`} />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">{feature.title}</h3>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <ComparisonTable />
      <PricingSection />

      {/* Final CTA */}
      <section className="py-32 bg-zinc-950 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/20 blur-[120px] rounded-full" />
        <div className="max-w-4xl mx-auto px-6 text-center space-y-12 z-10 relative">
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-tight">
            Ready to experience the <br />
            <span className="text-indigo-500">BabaBuilds advantage?</span>
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Button size="lg" className="h-16 px-12 bg-white text-zinc-950 hover:bg-zinc-100 rounded-2xl font-black text-xl shadow-2xl active:scale-95" asChild>
               <Link href="/api/auth/signin">Get Started for Free</Link>
            </Button>
            <Button size="lg" className="h-16 px-12 bg-transparent border border-zinc-800 text-white hover:bg-zinc-900 rounded-2xl font-bold text-xl transition-all" asChild>
               <Link href="/help">View Documentation</Link>
            </Button>
          </div>
          <div className="pt-8 flex flex-wrap justify-center gap-8 text-zinc-500 font-bold uppercase tracking-widest text-xs">
             <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" /> UDYAM Registered
             </div>
             <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-500" /> WCAG 2.2 Level AA
             </div>
             <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" /> Global Support
             </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
