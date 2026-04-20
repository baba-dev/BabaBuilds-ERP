"use client";

import Link from "next/link";
import { Box, Twitter, Linkedin, Github, Mail, Phone, MapPin } from "lucide-react";

export default function LandingFooter() {
  const sections = [
    {
      title: "Solutions",
      links: [
        { name: "Automated Invoicing", href: "#features" },
        { name: "Retainer Management", href: "#features" },
        { name: "Global Tax Compliance", href: "#features" },
        { name: "AI Financial Insights", href: "#features" },
      ],
    },
    {
      title: "Support",
      links: [
        { name: "Documentation", href: "/help" },
        { name: "Knowledge Base", href: "/help" },
        { name: "Security Audit", href: "#" },
        { name: "Status", href: "#" },
      ],
    },
    {
      title: "Company",
      links: [
        { name: "About Us", href: "#" },
        { name: "Reseller Program", href: "/reseller" },
        { name: "Careers", href: "#" },
        { name: "Privacy Policy", href: "/help/privacy" },
        { name: "Terms of Service", href: "/help/terms" },
      ],
    },
  ];

  return (
    <footer className="bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-20">
          {/* Brand */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center gap-3">
              <div className="bg-orange-600 p-2 rounded-xl">
                <Box className="h-6 w-6 text-white" />
              </div>
              <span className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                BabaBuilds <span className="text-orange-600">ERP</span>
              </span>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-sm text-lg leading-relaxed">
              The next generation of financial intelligence for global agencies. Operating in over 40 countries.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-orange-600 hover:text-white transition-all">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-orange-600 hover:text-white transition-all">
                <Linkedin className="w-5 h-5" />
              </a>
              <a href="#" className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-orange-600 hover:text-white transition-all">
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Links */}
          {sections.map((section) => (
            <div key={section.title} className="space-y-6">
              <h4 className="font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-widest text-sm">
                {section.title}
              </h4>
              <ul className="space-y-4">
                {section.links.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-zinc-500 dark:text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors font-medium"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-12 border-t border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 text-center md:text-left">
            <p className="text-sm text-zinc-500 font-medium">
              © {new Date().getFullYear()} BabaBuilds ERP. All rights reserved. Built with ❤️ for Global Agencies.
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
              Legal & policy center:{" "}
              <a
                href="https://erp.bababuilds.com/help/privacy"
                className="text-orange-600 dark:text-orange-400 hover:underline"
              >
                erp.bababuilds.com
              </a>
            </p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600">
               <span className="flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
                 <Box className="w-3 h-3 text-orange-600" /> MSME: UDYAM-RJ-21-0089275
               </span>
               <span className="flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
                 <Box className="w-3 h-3 text-emerald-500" /> WCAG 2.2 Level AA Compliant
               </span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-8 text-sm text-zinc-500 font-medium whitespace-nowrap">
            <span className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-orange-500" /> support@bababuilds.com
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-rose-500" /> Dubai • New Delhi • London
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
