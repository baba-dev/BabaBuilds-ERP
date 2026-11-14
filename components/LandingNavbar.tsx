"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Box,
  Menu,
  X,
  ArrowRight,
  ChevronDown,
  BriefcaseBusiness,
  HardHat,
  Building2,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { emitMarketingAnalyticsEvent } from "@/lib/marketing-analytics";

export default function LandingNavbar() {
  const t = useTranslations("LandingNavbar");
  const { data: session } = useSession();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: t("nav.features"), href: "#features" },
    { name: t("nav.comparison"), href: "#comparison" },
    { name: t("nav.pricing"), href: "#pricing" },
    { name: t("nav.forCa.title"), href: "/for-ca" },
    { name: t("nav.reseller.title"), href: "/reseller" },
  ];
  const useCaseLinks = [
    {
      name: t("nav.forAgencies.title"),
      href: "/for-agencies",
      description: t("nav.forAgencies.description"),
      icon: BriefcaseBusiness,
    },
    {
      name: t("nav.forContractors.title"),
      href: "/for-contractors",
      description: t("nav.forContractors.description"),
      icon: HardHat,
    },
    {
      name: t("nav.forSmallBusinesses.title"),
      href: "/for-small-businesses",
      description: t("nav.forSmallBusinesses.description"),
      icon: Building2,
    },
    {
      name: t("nav.forFreelancers.title"),
      href: "/for-freelancers",
      description: t("nav.forFreelancers.description"),
      icon: UserRound,
    },
  ];

  return (
    <nav
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300 px-6 py-4",
        isScrolled
          ? "bg-white/70 dark:bg-zinc-950/70 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 py-3"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="bg-orange-600 p-2 rounded-xl shadow-lg shadow-orange-500/20 group-hover:scale-110 transition-transform duration-300">
            <Box className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
            BabaBuilds <span className="text-orange-600">ERP</span>
          </span>
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
            >
              {link.name}
            </Link>
          ))}
          <div className="group relative">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 transition-colors hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400"
              aria-haspopup="true"
            >
              {t("nav.useCases")} <ChevronDown className="h-4 w-4" />
            </button>
            <div className="invisible absolute end-0 top-full z-50 mt-3 w-[28rem] rounded-2xl border border-zinc-200 bg-white p-3 opacity-0 shadow-2xl transition-all duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="grid grid-cols-2 gap-3">
                {useCaseLinks.map((useCase) => (
                  <Link
                    key={useCase.href}
                    href={useCase.href}
                    className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 transition hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50/70 dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-orange-800 dark:hover:bg-orange-950/30"
                  >
                    <div className="mb-2 inline-flex rounded-lg bg-white p-2 text-orange-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700 dark:text-orange-300">
                      <useCase.icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{useCase.name}</p>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{useCase.description}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Auth Buttons */}
        <div className="hidden md:flex items-center gap-4">
          {session ? (
            <Button
              asChild
              className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold gap-2"
            >
              {/* Plain anchor: a full document load can never get stuck on a stale client-router/service-worker state after a deploy. */}
              <a href="/dashboard">
                {t("actions.dashboard")} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </a>
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                asChild
                className="font-bold text-zinc-700 dark:text-zinc-300 hover:text-orange-600"
              >
                <Link
                  href="#demo-launcher"
                  onClick={() =>
                    emitMarketingAnalyticsEvent("interactive_demo_click", {
                      source: "navbar",
                      label: t("actions.exploreDemo"),
                    })
                  }
                >
                  {t("actions.exploreDemo")}
                </Link>
              </Button>
              <Button
                asChild
                className="bg-zinc-900 dark:bg-zinc-50 dark:text-zinc-950 text-white hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl font-bold"
              >
                <Link
                  href="/signup?plan=pro&cycle=monthly&trial=15&source=navbar"
                  onClick={() =>
                    emitMarketingAnalyticsEvent("trial_cta_click", {
                      source: "navbar",
                      label: t("actions.startTrial"),
                    })
                  }
                >
                  {t("actions.startTrial")}
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Toggle */}
        <button
          type="button"
          className="md:hidden p-2 text-zinc-900 dark:text-zinc-50 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? t("actions.closeMenu") : t("actions.openMenu")}
          title={mobileMenuOpen ? t("actions.closeMenu") : t("actions.openMenu")}
          aria-expanded={mobileMenuOpen}
          aria-controls="landing-mobile-menu"
        >
          {mobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            id="landing-mobile-menu"
            className="absolute inset-x-0 top-full flex max-h-[calc(100dvh-5rem)] flex-col gap-4 overflow-y-auto overscroll-contain border-b border-zinc-200 bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl dark:border-zinc-800 dark:bg-zinc-950 md:hidden"
          >
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="text-lg font-bold text-zinc-900 dark:text-zinc-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.name}
              </Link>
            ))}
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                {t("nav.useCases")}
              </p>
              <div className="grid gap-2">
                {useCaseLinks.map((useCase) => (
                  <Link
                    key={useCase.href}
                    href={useCase.href}
                    className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:border-orange-300 hover:text-orange-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-orange-800 dark:hover:text-orange-300 rtl:flex-row-reverse rtl:justify-between"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <useCase.icon className="h-4 w-4 text-orange-500" />
                    {useCase.name}
                  </Link>
                ))}
              </div>
            </div>
            <hr className="border-zinc-100 dark:border-zinc-800" />
            {session ? (
              <Button
                asChild
                className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold py-6"
              >
                <a href="/dashboard">{t("actions.goToDashboard")}</a>
              </Button>
            ) : (
              <div className="flex flex-col gap-3">
                <Button
                  variant="outline"
                  asChild
                  className="w-full rounded-xl font-bold py-6"
                >
                  <Link
                    href="#demo-launcher"
                    onClick={() =>
                      emitMarketingAnalyticsEvent("interactive_demo_click", {
                        source: "mobile_navbar",
                        label: t("actions.exploreDemo"),
                      })
                    }
                  >
                    {t("actions.exploreDemo")}
                  </Link>
                </Button>
                <Button
                  asChild
                  className="w-full bg-zinc-900 dark:bg-zinc-50 dark:text-zinc-950 text-white rounded-xl font-bold py-6"
                >
                  <Link
                    href="/signup?plan=pro&cycle=monthly&trial=15&source=mobile_navbar"
                    onClick={() =>
                      emitMarketingAnalyticsEvent("trial_cta_click", {
                        source: "mobile_navbar",
                        label: t("actions.startTrial"),
                      })
                    }
                  >
                    {t("actions.startTrial")}
                  </Link>
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
