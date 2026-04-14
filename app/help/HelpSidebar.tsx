"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronRight, Menu, X, ArrowLeft, Mail, Search, Clock3, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DocMeta {
  slug: string;
  title: string;
  description: string;
  order: number;
  category?: string;
  tags?: string[];
  estimatedMinutes?: number;
}

interface HelpSidebarProps {
  docs: DocMeta[];
}

export function HelpSidebar({ docs }: HelpSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);

  const grouped = useMemo(() => {
    const map = new Map<string, DocMeta[]>();
    for (const doc of docs) {
      const key = doc.category?.trim() || "General";
      const bucket = map.get(key);
      if (bucket) bucket.push(doc);
      else map.set(key, [doc]);
    }

    const groups = Array.from(map.entries()).map(([category, items]) => ({
      category,
      categorySlug: category
        .trim()
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
      docs: [...items].sort((a, b) => a.order - b.order),
    }));

    return groups.sort((a, b) => a.category.localeCompare(b.category));
  }, [docs]);

  const filteredGroups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return grouped;

    const match = (doc: DocMeta) => {
      const tags = (doc.tags ?? []).join(" ").toLowerCase();
      const category = (doc.category ?? "").toLowerCase();
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.slug.toLowerCase().includes(q) ||
        doc.description.toLowerCase().includes(q) ||
        tags.includes(q) ||
        category.includes(q)
      );
    };

    return grouped
      .map((g) => ({ ...g, docs: g.docs.filter(match) }))
      .filter((g) => g.docs.length > 0);
  }, [filter, grouped]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("help_recent_slugs_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setRecentSlugs(parsed.filter((s): s is string => typeof s === "string").slice(0, 6));
        }
      }
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    const match = pathname?.match(/^\/help\/([^/]+)$/);
    if (!match) return;
    const slug = match[1];
    if (!slug) return;

    setRecentSlugs((current) => {
      const next = [slug, ...current.filter((s) => s !== slug)].slice(0, 6);
      try {
        localStorage.setItem("help_recent_slugs_v1", JSON.stringify(next));
      } catch {
        // no-op
      }
      return next;
    });
  }, [pathname]);

  const recentDocs = useMemo(() => {
    if (!recentSlugs.length) return [];
    const bySlug = new Map(docs.map((d) => [d.slug, d] as const));
    return recentSlugs.map((s) => bySlug.get(s)).filter(Boolean) as DocMeta[];
  }, [docs, recentSlugs]);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-5 border-b border-zinc-100 dark:border-zinc-800">
        <Link
          href="/"
          className="mb-4 flex items-center gap-2 rounded-md text-xs font-bold text-zinc-400 transition-colors group hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-zinc-500 dark:hover:text-zinc-300 dark:focus-visible:ring-offset-zinc-900"
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
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
        <div className="px-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search help…"
              className="h-10 pl-10 pr-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              aria-label="Filter Help Center articles"
            />
          </div>
        </div>

        {recentDocs.length > 0 && !filter.trim() && (
          <div className="space-y-2">
            <p className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.18em] px-2">
              Recently viewed
            </p>
            <div className="space-y-0.5">
              {recentDocs.map((doc) => {
                const isActive = pathname === `/help/${doc.slug}`;
                return (
                  <Link
                    key={doc.slug}
                    href={`/help/${doc.slug}`}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group",
                      isActive
                        ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200",
                    )}
                  >
                    <span className="truncate">{doc.title}</span>
                    <ChevronRight
                      className={cn(
                        "w-3.5 h-3.5 shrink-0 transition-transform",
                        isActive
                          ? "text-indigo-500"
                          : "text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 dark:group-hover:text-zinc-500",
                      )}
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.18em] px-2">
            Categories
          </p>

          <div className="space-y-5">
            {filteredGroups.map((group) => (
              <div key={group.category} className="space-y-1">
                <Link
                  href={`/help/category/${group.categorySlug}`}
                  onClick={() => setMobileOpen(false)}
                  className="px-2 py-1 inline-flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  <Tag className="w-3.5 h-3.5 text-indigo-500/70" />
                  {group.category}
                </Link>

                <div className="space-y-0.5">
                  {group.docs.map((doc) => {
                    const isActive = pathname === `/help/${doc.slug}`;
                    return (
                      <Link
                        key={doc.slug}
                        href={`/help/${doc.slug}`}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group",
                          isActive
                            ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50"
                            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200",
                        )}
                      >
                        <span className="truncate">{doc.title}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {typeof doc.estimatedMinutes === "number" && (
                            <span className="hidden xl:inline-flex items-center gap-1 text-[10px] font-bold text-zinc-400 dark:text-zinc-600">
                              <Clock3 className="w-3 h-3" />
                              {doc.estimatedMinutes}m
                            </span>
                          )}
                          <ChevronRight
                            className={cn(
                              "w-3.5 h-3.5 transition-transform",
                              isActive
                                ? "text-indigo-500"
                                : "text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 dark:group-hover:text-zinc-500",
                            )}
                          />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            {filteredGroups.length === 0 && (
              <div className="px-2 py-6 text-sm text-zinc-500 dark:text-zinc-400">
                No matches for “{filter.trim()}”.
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Footer Contact */}
      <div className="p-4 border-t border-zinc-100 dark:border-zinc-800">
        <a
          href="mailto:admin@bababuilds.com"
          className="flex items-center gap-2 rounded-md text-xs font-medium text-zinc-500 transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-zinc-400 dark:hover:text-indigo-400 dark:focus-visible:ring-offset-zinc-900"
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
        className="lg:hidden fixed top-20 left-4 z-40 flex items-center gap-2 min-h-10 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-900/20 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 active:scale-95 disabled:bg-indigo-600/60 disabled:text-white/70 transition-all"
        aria-label="Open Help sidebar"
        aria-controls="help-sidebar-drawer"
        aria-expanded={mobileOpen}
      >
        <Menu className="w-4 h-4" />
        Help Menu
      </Button>

      {/* --- MOBILE DRAWER OVERLAY --- */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[130] flex"
          onClick={() => setMobileOpen(false)}
        >
          {/* Backdrop */}
          <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm animate-in fade-in duration-200" />

          {/* Drawer */}
          <div
            id="help-sidebar-drawer"
            className="relative z-50 w-[min(85vw,320px)] bg-white dark:bg-zinc-900 h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <Button
              onClick={() => setMobileOpen(false)}
              variant="ghost"
              size="icon-lg"
              className="absolute right-4 top-4 rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 disabled:bg-zinc-100/60 disabled:text-zinc-400 dark:disabled:bg-zinc-800/60 dark:disabled:text-zinc-500 transition-colors"
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
