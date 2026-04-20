"use client";

import Link from "next/link";
import { Box, Mail, MapPin, ShieldCheck, FileText, LifeBuoy } from "lucide-react";
import { personaNavigationLinks } from "@/components/landing/persona/persona-config";

export default function LandingFooter() {
  const keyPersonaLinks = personaNavigationLinks.slice(0, 3);

  const sections = [
    {
      title: "Product",
      links: [
        { name: "Features", href: "#features" },
        { name: "Pricing", href: "#pricing" },
        { name: "Interactive Demo", href: "#demo-launcher" },
      ],
    },
    {
      title: "By Persona",
      links: keyPersonaLinks.map((item) => ({
        name: item.label,
        href: item.href,
      })),
    },
    {
      title: "Legal",
      links: [
        { name: "Reseller Program", href: "/reseller" },
        { name: "Privacy Policy", href: "/help/privacy" },
        { name: "Terms of Service", href: "/help/terms" },
        { name: "Help Center", href: "/help" },
      ],
    },
  ];

  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 pt-20 pb-10 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 gap-12 border-b border-zinc-200 pb-12 dark:border-zinc-800 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="bg-orange-600 p-2 rounded-xl">
                <Box className="h-6 w-6 text-white" />
              </div>
              <span className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                BabaBuilds <span className="text-orange-600">ERP</span>
              </span>
            </div>
            <p className="max-w-md text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
              Public-ready ERP platform for invoicing, compliance, and growth operations.
            </p>
            <div className="rounded-2xl border border-zinc-200 bg-white/90 px-4 py-3 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-200">
              <p className="flex items-start gap-2 font-semibold">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                Address - Pilani, Rajasthan, India.
              </p>
            </div>
          </div>

          {/* Links */}
          {sections.map((section) => (
            <div key={section.title} className="space-y-4">
              <h4 className="font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-widest text-sm">
                {section.title}
              </h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-zinc-600 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-orange-400 transition-colors font-medium"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3 text-center md:text-left">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              © {new Date().getFullYear()} BabaBuilds ERP. All rights reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                Secure billing
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <FileText className="h-3.5 w-3.5 text-orange-500" />
                GST/VAT ready
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <LifeBuoy className="h-3.5 w-3.5 text-sky-500" />
                Public support docs
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 text-sm font-medium text-zinc-500 dark:text-zinc-400 md:items-end">
            <span className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-orange-500" /> support@bababuilds.com
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-rose-500" /> Pilani, Rajasthan, India
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
