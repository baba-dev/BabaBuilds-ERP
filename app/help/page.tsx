import type { Metadata } from "next";
import { getAllDocs } from "@/lib/docs";
import Link from "next/link";
import { BookOpen, ArrowRight, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { typography } from "@/lib/ui/typography";

export const metadata: Metadata = {
  title: "Help Center",
  description: "Explore BabaBuilds ERP documentation, onboarding guides, and workflow tutorials.",
  alternates: {
    canonical: "https://erp.bababuilds.com/help",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function HelpPage() {
  const docs = getAllDocs();

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={cn(typography.pageTitle, "text-2xl sm:text-3xl lg:text-4xl")}>Help Center</h1>
            <p className={cn(typography.bodyCopy, "text-xs sm:text-sm")}>BabaBuilds ERP Documentation</p>
          </div>
        </div>
        <p className={cn(typography.bodyCopy, "max-w-2xl")}>
          Everything you need to get the most out of BabaBuilds ERP. Choose an article from the sidebar or browse below.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {docs.map((doc) => (
          <Link
            key={doc.slug}
            href={`/help/${doc.slug}`}
            className="group flex flex-col justify-between p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-indigo-300 dark:hover:border-indigo-700/50 hover:shadow-md transition-all duration-200"
          >
            <div>
              <h2 className={cn(typography.sectionHeader, "text-base sm:text-lg group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1.5")}>
                {doc.title}
              </h2>
              <p className={cn(typography.bodyCopy, "text-sm")}>{doc.description}</p>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-4 group-hover:gap-2 transition-all">
              Read guide <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2 p-4 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-600 dark:text-zinc-400">
        <Mail className="w-4 h-4 shrink-0 text-indigo-500" />
        <span>
          Can&apos;t find what you need? Reach out at{" "}
          <a href="mailto:admin@bababuilds.com" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
            admin@bababuilds.com
          </a>
        </span>
      </div>
    </div>
  );
}
