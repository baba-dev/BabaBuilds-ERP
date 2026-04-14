import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { typography } from "@/lib/ui/typography";
import { getAllDocs, groupDocsByCategory, slugToCategoryTitle } from "@/lib/docs";

interface Props {
  params: Promise<{ categorySlug: string }>;
}

export async function generateStaticParams() {
  const docs = getAllDocs();
  const groups = groupDocsByCategory(docs);
  return groups.map((g) => ({ categorySlug: g.category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorySlug } = await params;
  const title = slugToCategoryTitle(categorySlug);
  return {
    title: `${title} — Help Center`,
    description: `Guides and workflows for ${title} in BabaBuilds ERP.`,
    robots: { index: true, follow: true },
  };
}

export default async function HelpCategoryPage({ params }: Props) {
  const { categorySlug } = await params;
  const docs = getAllDocs();
  const groups = groupDocsByCategory(docs);
  const match = groups.find((g) => g.category.slug === categorySlug);
  if (!match) notFound();

  const { category, docs: categoryDocs } = match;

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/help"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          All categories
        </Link>

        <div className="mt-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/10 border border-indigo-200/50 dark:border-indigo-900/40 flex items-center justify-center">
            <FolderOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="min-w-0">
            <h1 className={cn(typography.pageTitle, "text-2xl sm:text-3xl")}>{category.title}</h1>
            <p className={cn(typography.bodyCopy, "mt-2 max-w-2xl")}>
              {category.description ?? "Step-by-step guides, workflows, and best practices."}
            </p>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-600">
              {category.count} {category.count === 1 ? "article" : "articles"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {categoryDocs.map((doc) => (
          <Link
            key={doc.slug}
            href={`/help/${doc.slug}`}
            className="group flex flex-col justify-between p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-indigo-300 dark:hover:border-indigo-700/50 hover:shadow-md transition-all duration-200"
          >
            <div>
              <h2
                className={cn(
                  typography.sectionHeader,
                  "text-base sm:text-lg group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1.5",
                )}
              >
                {doc.title}
              </h2>
              <p className={cn(typography.bodyCopy, "text-sm")}>{doc.description}</p>
            </div>
            <div className="flex items-center justify-between mt-5">
              <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                {doc.estimatedMinutes ? `${doc.estimatedMinutes} min` : "Guide"}
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 group-hover:gap-2 transition-all">
                Read <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

