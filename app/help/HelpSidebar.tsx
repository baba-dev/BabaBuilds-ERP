"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronRight, Menu, X, ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocMeta {
  slug: string;
  title: string;
  description: string;
  order: number;
}

interface HelpSidebarProps {
  docs: DocMeta[];
}

export function HelpSidebar({ docs }: HelpSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-5 border-b border-zinc-100 dark:border-zinc-800">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs font-bold text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-4 transition-colors group"
        >
          <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
          Back to ERP
        </Link>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-900/20">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-zinc-900 dark:text-zinc-50 text-sm leading-tight">Help Center</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium mt-0.5">BabaBuilds ERP Guides</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-2 py-2">
          Articles
        </p>
        {docs.map((doc) => {
          const isActive = pathname === `/help/${doc.slug}`;
          return (
            <Link
              key={doc.slug}
              href={`/help/${doc.slug}`}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              <span className="truncate">{doc.title}</span>
              <ChevronRight
                className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                  isActive ? "text-indigo-500" : "text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 dark:group-hover:text-zinc-500"
                }`}
              />
            </Link>
          );
        })}
      </nav>

      {/* Footer Contact */}
      <div className="p-4 border-t border-zinc-100 dark:border-zinc-800">
        <a
          href="mailto:admin@bababuilds.com"
          className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <Mail className="w-3.5 h-3.5" />
          admin@bababuilds.com
        </a>
        <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">Need help? Reach out anytime.</p>
      </div>
    </div>
  );

  return (
    <>
      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 h-screen overflow-hidden">
        <SidebarContent />
      </aside>

      {/* --- MOBILE TOGGLE BUTTON --- */}
      <Button
        onClick={() => setMobileOpen(true)}
        variant="default"
        size="lg"
        className="lg:hidden fixed top-20 left-4 z-40 min-h-10 rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white shadow-lg shadow-indigo-900/20 hover:bg-indigo-700 focus-visible:ring-indigo-500/70 active:scale-95 disabled:bg-indigo-600/60 disabled:text-white/70"
        aria-label="Open Help sidebar"
      >
        <Menu className="w-4 h-4" />
        Help Menu
      </Button>

      {/* --- MOBILE DRAWER OVERLAY --- */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          onClick={() => setMobileOpen(false)}
        >
          {/* Backdrop */}
          <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm animate-in fade-in duration-200" />

          {/* Drawer */}
          <div
            className="relative z-50 w-[280px] bg-white dark:bg-zinc-900 h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              onClick={() => setMobileOpen(false)}
              variant="ghost"
              size="icon-lg"
              className="absolute right-4 top-4 rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:ring-indigo-500/70 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 disabled:bg-zinc-100/60 disabled:text-zinc-400 dark:disabled:bg-zinc-800/60 dark:disabled:text-zinc-500"
              aria-label="Close Help sidebar"
            >
              <X className="w-4 h-4" />
            </Button>
            <SidebarContent />
          </div>
        </div>
      )}
    </>
  );
}
