"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { HelpSearch } from "@/app/help/_components/HelpSearch";
import { CategoryCard } from "@/app/help/_components/CategoryCard";

type DocMeta = {
  slug: string;
  title: string;
  description: string;
  category?: string;
  tags?: string[];
  estimatedMinutes?: number;
  isFeatured?: boolean;
};

type DocsCategory = { slug: string; title: string; description?: string; icon?: string; count: number };
type Group = { category: DocsCategory; docs: DocMeta[] };

function pickSuggestedSlugs(pathname: string | null | undefined): string[] {
  const path = pathname ?? "";

  if (path.startsWith("/invoice")) return ["generating-invoices", "payment-gateways"];
  if (path.startsWith("/income")) return ["generating-invoices", "retainers-and-mrr"];
  if (path.startsWith("/clients")) return ["managing-clients", "generating-invoices"];
  if (path.startsWith("/expenses")) return ["expenses-and-tax", "accounting-traceability-matrix"];
  if (path.startsWith("/tax")) return ["expenses-and-tax", "accounting-traceability-matrix"];
  if (path.startsWith("/reconciliation")) return ["accounting-traceability-matrix", "expenses-and-tax"];
  if (path.startsWith("/settings")) return ["settings-guide", "payment-gateways", "ai-bababot"];
  if (path.startsWith("/retainers")) return ["retainers-and-mrr", "generating-invoices"];

  return ["getting-started", "settings-guide", "generating-invoices"];
}

export function InAppHelpHubClient({
  docs,
  featured,
  groups,
}: {
  docs: DocMeta[];
  featured: DocMeta[];
  groups: Group[];
}) {
  const pathname = usePathname();

  const suggested = useMemo(() => {
    const bySlug = new Map(docs.map((d) => [d.slug, d] as const));
    return pickSuggestedSlugs(pathname)
      .map((slug) => bySlug.get(slug))
      .filter(Boolean) as DocMeta[];
  }, [docs, pathname]);

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">Help</h1>
            <p className="mt-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Search public docs, browse categories, and share links with your team.
            </p>
          </div>
        </div>
        <div className="mt-5 max-w-2xl">
          <HelpSearch docs={docs} autoFocus />
        </div>
      </section>

      {suggested.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">Suggested for this page</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {suggested.map((doc) => (
              <Link
                key={doc.slug}
                href={`/help/${doc.slug}`}
                className={cn(
                  "group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5",
                  "hover:border-orange-300 dark:hover:border-orange-700/50 hover:shadow-md transition-all",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-zinc-900 dark:text-zinc-50 truncate">{doc.title}</p>
                    <p className="mt-1 text-sm font-medium text-zinc-500 dark:text-zinc-400 line-clamp-2">{doc.description}</p>
                    {doc.category ? (
                      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-600">
                        {doc.category}
                      </p>
                    ) : null}
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:text-orange-500 shrink-0 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">Browse categories</h2>
          <p className="mt-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">Fast paths into the workflows.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((g) => (
            <CategoryCard
              key={g.category.slug}
              href={`/help/category/${g.category.slug}`}
              title={g.category.title}
              description={g.category.description}
              count={g.category.count}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">Featured</h2>
            <p className="mt-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">The best place to start.</p>
          </div>
          <Link href="/help" className="text-sm font-bold text-orange-600 dark:text-orange-400 hover:underline">
            Open Help Center
          </Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {featured.slice(0, 6).map((doc) => (
            <Link
              key={doc.slug}
              href={`/help/${doc.slug}`}
              className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-orange-300 dark:hover:border-orange-700/50 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-black text-zinc-900 dark:text-zinc-50 truncate">{doc.title}</p>
                  <p className="mt-1 text-sm font-medium text-zinc-500 dark:text-zinc-400 line-clamp-2">{doc.description}</p>
                  <p className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-600">
                    {doc.category ?? "Guide"}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:text-orange-500 shrink-0 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

