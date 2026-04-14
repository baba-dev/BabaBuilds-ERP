import type { Metadata } from "next";
import { getAllDocs, getFeaturedDocs, groupDocsByCategory } from "@/lib/docs";
import Link from "next/link";
import { BookOpen, ArrowRight, Mail, Sparkles, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { typography } from "@/lib/ui/typography";
import { HelpSearch } from "./_components/HelpSearch";
import { CategoryCard } from "./_components/CategoryCard";

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
  const featured = getFeaturedDocs(docs, 9);
  const groups = groupDocsByCategory(docs);
  const categories = groups.map((g) => g.category);

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-10">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 via-transparent to-emerald-600/10 pointer-events-none" />
        <div className="relative">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className={cn(typography.pageTitle, "text-3xl sm:text-4xl lg:text-5xl")}>Help Center</h1>
                <p className={cn(typography.bodyCopy, "text-sm sm:text-base")}>Documentation, onboarding, workflows, and best practices.</p>
              </div>
            </div>
            <div className="hidden lg:flex items-center gap-2 text-xs font-bold text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Public docs
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <Zap className="w-3.5 h-3.5 text-indigo-500" />
                Fast search
              </span>
            </div>
          </div>

          <div className="mt-6 max-w-2xl">
            <HelpSearch docs={docs} />
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <Link className="px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-indigo-300 dark:hover:border-indigo-800 hover:shadow-sm transition-all" href="/help/category/getting-started">
                Getting started
              </Link>
              <Link className="px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-indigo-300 dark:hover:border-indigo-800 hover:shadow-sm transition-all" href="/help/category/invoicing">
                Invoicing
              </Link>
              <Link className="px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-indigo-300 dark:hover:border-indigo-800 hover:shadow-sm transition-all" href="/help/category/payments">
                Payments
              </Link>
              <Link className="px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-indigo-300 dark:hover:border-indigo-800 hover:shadow-sm transition-all" href="/help/category/tax-and-compliance">
                Tax & compliance
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className={cn(typography.sectionHeader, "text-xl sm:text-2xl")}>Browse by category</h2>
            <p className={cn(typography.bodyCopy, "text-sm")}>Find the exact guide you need, faster.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((category) => (
            <CategoryCard
              key={category.slug}
              href={`/help/category/${category.slug}`}
              title={category.title}
              description={category.description}
              count={category.count}
            />
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <h2 className={cn(typography.sectionHeader, "text-xl sm:text-2xl")}>Featured guides</h2>
            </div>
            <p className={cn(typography.bodyCopy, "text-sm")}>The most important workflows to master first.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {featured.map((doc) => (
            <Link
              key={doc.slug}
              href={`/help/${doc.slug}`}
              className="group flex flex-col justify-between p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-indigo-300 dark:hover:border-indigo-700/50 hover:shadow-md transition-all duration-200"
            >
              <div>
                <h3 className={cn(typography.sectionHeader, "text-base sm:text-lg group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1.5")}>
                  {doc.title}
                </h3>
                <p className={cn(typography.bodyCopy, "text-sm")}>{doc.description}</p>
              </div>
              <div className="flex items-center justify-between mt-5">
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  {doc.category ? doc.category : "Guide"}
                  {doc.estimatedMinutes ? ` • ${doc.estimatedMinutes} min` : null}
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 group-hover:gap-2 transition-all">
                  Read <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-7">
          <h3 className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">Popular tasks</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <Link className="px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700/50 transition-colors" href="/help/generating-invoices">
              Create and send an invoice
            </Link>
            <Link className="px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700/50 transition-colors" href="/help/payment-gateways">
              Connect Stripe or Razorpay
            </Link>
            <Link className="px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700/50 transition-colors" href="/help/settings-guide">
              Configure settings
            </Link>
            <Link className="px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700/50 transition-colors" href="/help/expenses-and-tax">
              Track expenses and tax
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-900 dark:bg-white p-7 text-white dark:text-zinc-900 overflow-hidden relative">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_10%,rgba(99,102,241,0.8),transparent_55%),radial-gradient(circle_at_80%_30%,rgba(16,185,129,0.7),transparent_55%)]" />
          <div className="relative">
            <h3 className="text-sm font-black tracking-tight mb-2">Need a human?</h3>
            <p className="text-sm text-zinc-300 dark:text-zinc-600 max-w-md">
              If you can’t find what you need, our team will point you to the right workflow or fix the docs.
            </p>
            <div className="mt-5 flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 shrink-0 text-indigo-300 dark:text-indigo-500" />
              <a href="mailto:admin@bababuilds.com" className="font-bold hover:underline">
                admin@bababuilds.com
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
