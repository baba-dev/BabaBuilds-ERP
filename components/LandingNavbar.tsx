"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Box, Menu, X, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

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
  ];

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-6 py-4",
        isScrolled
          ? "bg-white/70 dark:bg-zinc-950/70 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 py-3"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform duration-300">
            <Box className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
            BabaBuilds <span className="text-indigo-600">ERP</span>
          </span>
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              {link.name}
            </Link>
          ))}
        </div>

        {/* Auth Buttons */}
        <div className="hidden md:flex items-center gap-4">
          {session ? (
            <Button
              asChild
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold gap-2"
            >
              <Link href="/dashboard">
                {t("actions.dashboard")} <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                asChild
                className="font-bold text-zinc-700 dark:text-zinc-300 hover:text-indigo-600"
              >
                <Link href="/api/auth/signin">{t("actions.login")}</Link>
              </Button>
              <Button
                asChild
                className="bg-zinc-900 dark:bg-zinc-50 dark:text-zinc-950 text-white hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl font-bold"
              >
                <Link href="/api/auth/signin">{t("actions.getStarted")}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Toggle */}
        <button
          type="button"
          className="md:hidden p-2 text-zinc-900 dark:text-zinc-50 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          title={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
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
            className="absolute top-full left-0 right-0 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 p-6 flex flex-col gap-4 md:hidden shadow-xl"
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
            <hr className="border-zinc-100 dark:border-zinc-800" />
            {session ? (
              <Button
                asChild
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold py-6"
              >
                <Link href="/dashboard">{t("actions.goToDashboard")}</Link>
              </Button>
            ) : (
              <div className="flex flex-col gap-3">
                <Button
                  variant="outline"
                  asChild
                  className="w-full rounded-xl font-bold py-6"
                >
                  <Link href="/api/auth/signin">{t("actions.login")}</Link>
                </Button>
                <Button
                  asChild
                  className="w-full bg-zinc-900 dark:bg-zinc-50 dark:text-zinc-950 text-white rounded-xl font-bold py-6"
                >
                  <Link href="/api/auth/signin">{t("actions.getStartedFree")}</Link>
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
