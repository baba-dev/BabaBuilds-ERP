"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function CategoryCard({
  href,
  title,
  description,
  count,
  className,
}: {
  href: string;
  title: string;
  description?: string;
  count: number;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-900/50",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">{title}</p>
          {description ? (
            <p className="mt-1 text-sm font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</p>
          ) : (
            <p className="mt-1 text-sm font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
              Browse guides, workflows, and best practices.
            </p>
          )}
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-500 dark:text-zinc-600" />
      </div>

      <div className="mt-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600">
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950/40">
          {count} {count === 1 ? "article" : "articles"}
        </span>
        <span className="text-indigo-600/70 dark:text-indigo-400/70">Explore</span>
      </div>

      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="absolute -right-24 -top-24 h-48 w-48 rounded-full bg-indigo-500/10 blur-2xl dark:bg-indigo-400/10" />
      </div>
    </Link>
  );
}

