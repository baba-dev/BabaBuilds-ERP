"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight, Clock3, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type HelpSearchDoc = {
  slug: string;
  title: string;
  description: string;
  category?: string;
  tags?: string[];
  estimatedMinutes?: number;
};

type Result = HelpSearchDoc & { score: number };

function scoreDoc(doc: HelpSearchDoc, rawQuery: string): number {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return 0;

  const title = doc.title.toLowerCase();
  const desc = doc.description.toLowerCase();
  const slug = doc.slug.toLowerCase();
  const tags = (doc.tags ?? []).join(" ").toLowerCase();
  const category = (doc.category ?? "").toLowerCase();

  let score = 0;
  if (title === q) score += 1000;
  if (slug === q) score += 900;
  if (title.includes(q)) score += 220;
  if (slug.includes(q)) score += 180;
  if (tags.includes(q)) score += 140;
  if (category.includes(q)) score += 90;
  if (desc.includes(q)) score += 70;
  return score;
}

export function HelpSearch({
  docs,
  autoFocus,
}: {
  docs: HelpSearchDoc[];
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [] as Result[];

    return docs
      .map((doc) => ({ ...doc, score: scoreDoc(doc, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [docs, query]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={autoFocus}
          placeholder="Search guides, workflows, and setup instructions…"
          className={cn(
            "h-12 pl-11 pr-4 rounded-2xl bg-white/80 dark:bg-zinc-950/60 border-zinc-200/80 dark:border-zinc-800/80",
            "shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
          )}
          aria-label="Search Help Center articles"
        />
      </div>

      {results.length > 0 && (
        <div className="absolute z-30 mt-3 w-full overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-900/60">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
              Top matches
            </p>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900/60">
            {results.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/help/${r.slug}`}
                  className="group block px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50 truncate">
                        {r.title}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-1">
                        {r.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
                        {r.category && (
                          <span className="inline-flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {r.category}
                          </span>
                        )}
                        {typeof r.estimatedMinutes === "number" && (
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="w-3 h-3" />
                            {r.estimatedMinutes} min
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:text-indigo-500 shrink-0 transition-colors" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-900/60 bg-zinc-50/60 dark:bg-zinc-900/20">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Tip: try “stripe”, “razorpay”, “GST”, or “reconciliation”.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

