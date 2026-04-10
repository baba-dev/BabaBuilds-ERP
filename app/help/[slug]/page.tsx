import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDocBySlug, getAllDocs } from "@/lib/docs";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import { 
  ArrowLeft, ArrowRight, Mail, Info, 
  Lightbulb, AlertCircle, CheckCircle2, ChevronRight 
} from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

// PREMIUM MDX COMPONENTS
const components = {
  h2: ({ children, ...props }: any) => (
    <h2 {...props} className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mt-12 mb-5 pb-2.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2 group">
      <span className="w-1.5 h-6 bg-indigo-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity -ml-3.5 mr-2"></span>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: any) => (
    <h3 {...props} className="text-lg font-bold text-zinc-800 dark:text-zinc-100 mt-8 mb-4">
      {children}
    </h3>
  ),
  p: ({ children, ...props }: any) => (
    <p {...props} className="text-[15px] leading-7 text-zinc-600 dark:text-zinc-400 mb-6">
      {children}
    </p>
  ),
  ul: ({ children, ...props }: any) => (
    <ul {...props} className="space-y-3 mb-8 ml-1">
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: any) => (
    <ol {...props} className="space-y-4 mb-8 list-decimal list-inside marker:text-indigo-600 marker:font-bold">
      {children}
    </ol>
  ),
  li: ({ children, ...props }: any) => (
    <li {...props} className="flex gap-3 text-[15px] leading-7 text-zinc-600 dark:text-zinc-400">
      <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-indigo-600/40 shrink-0"></span>
      <span>{children}</span>
    </li>
  ),
  blockquote: ({ children, ...props }: any) => (
    <div className="my-8 p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 flex gap-4 animate-in fade-in slide-in-from-left-4 duration-500">
      <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-indigo-100 dark:border-indigo-800 shadow-sm flex items-center justify-center shrink-0">
        <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
      </div>
      <div className="text-[14px] leading-relaxed text-zinc-700 dark:text-zinc-300 italic italic-none">
        {children}
      </div>
    </div>
  ),
  table: ({ children, ...props }: any) => (
    <div className="my-8 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <table {...props} className="w-full text-left text-[14px]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: any) => (
    <thead {...props} className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
      {children}
    </thead>
  ),
  th: ({ children, ...props }: any) => (
    <th {...props} className="px-4 py-3 font-bold text-zinc-900 dark:text-zinc-100">
      {children}
    </th>
  ),
  td: ({ children, ...props }: any) => (
    <td {...props} className="px-4 py-3 text-zinc-600 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800/50 last:border-0">
      {children}
    </td>
  ),
  hr: () => <hr className="my-12 border-zinc-200 dark:border-zinc-800" />,
  // Optional Custom Callout Component
  Callout: ({ type = "info", children }: { type?: "info" | "tip" | "warn" | "success"; children: React.ReactNode }) => {
    const styles = {
      info: { bg: "bg-blue-50/50 dark:bg-blue-950/20", border: "border-blue-100 dark:border-blue-900", icon: Info, color: "text-blue-600" },
      tip: { bg: "bg-emerald-50/50 dark:bg-emerald-950/20", border: "border-emerald-100 dark:border-emerald-900", icon: Lightbulb, color: "text-emerald-600" },
      warn: { bg: "bg-amber-50/50 dark:bg-amber-950/20", border: "border-amber-100 dark:border-amber-900", icon: AlertCircle, color: "text-amber-600" },
      success: { bg: "bg-emerald-50/50 dark:bg-emerald-950/20", border: "border-emerald-100 dark:border-emerald-900", icon: CheckCircle2, color: "text-emerald-600" },
    };
    const { bg, border, icon: Icon, color } = styles[type];
    return (
      <div className={`my-8 p-5 rounded-2xl ${bg} border ${border} flex gap-4`}>
        <div className={`w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border ${border} shadow-sm flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div className="text-[14px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {children}
        </div>
      </div>
    );
  }
};

// Pre-generate all known doc pages at build time
export async function generateStaticParams() {
  const docs = getAllDocs();
  return docs.map((doc) => ({ slug: doc.slug }));
}

const BASE_URL = "https://erp.bababuilds.com";

// Dynamic metadata per doc
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const doc = getDocBySlug(slug);
    const canonicalUrl = `${BASE_URL}/help/${slug}`;

    return {
      title: `${doc.title} — BabaBuilds ERP Help`,
      description: doc.description,
      keywords: [
        "How to generate invoices",
        "Bank reconciliation guide",
        "BabaBuilds Help",
        "ERP Tutorials",
        slug.replace(/-/g, " "),
      ],
      alternates: {
        canonical: canonicalUrl,
        languages: {
          "en-IN": canonicalUrl,
          "hi": canonicalUrl,
          "ar": canonicalUrl,
          "es": canonicalUrl,
          "x-default": canonicalUrl,
        },
      },
      openGraph: {
        title: `${doc.title} | BabaBuilds Help Center`,
        description: doc.description,
        url: canonicalUrl,
        siteName: "BabaBuilds ERP",
        type: "article",
        images: [{ url: "/icons/Banner-1.png", width: 1536, height: 1024 }],
      },
      twitter: {
        card: "summary_large_image",
        title: `${doc.title} | Help Center`,
        description: doc.description,
        images: ["/icons/Banner-1.png"],
      },
    };
  } catch {
    return { title: "Help Center — BabaBuilds ERP" };
  }
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;

  let doc;
  try {
    doc = getDocBySlug(slug);
  } catch {
    notFound();
  }

  // Prev/Next navigation
  const allDocs = getAllDocs();
  const currentIndex = allDocs.findIndex((d) => d.slug === slug);
  const prevDoc = currentIndex > 0 ? allDocs[currentIndex - 1] : null;
  const nextDoc = currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : null;

  // ── Article JSON-LD for each help doc ──
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: doc.title,
    description: doc.description,
    url: `${BASE_URL}/help/${slug}`,
    image: `${BASE_URL}/icons/Banner-1.png`,
    author: {
      "@type": "Organization",
      name: "BabaBuilds",
      url: BASE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "BabaBuilds",
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}/icons/BabaBuillds_ERP_Logo.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${BASE_URL}/help/${slug}`,
    },
    inLanguage: "en-IN",
  };

  return (
    <div className="space-y-10">
      {/* Article structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <div className="pb-6 border-b border-zinc-200 dark:border-zinc-800">
        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-3">
          Guide #{doc.order}
        </p>
        <h1 className="text-4xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 mb-4 bg-gradient-to-r from-zinc-900 to-zinc-500 dark:from-zinc-50 dark:to-zinc-500 bg-clip-text text-transparent">
          {doc.title}
        </h1>
        <p className="text-lg text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">
          {doc.description}
        </p>
      </div>

      {/* Markdown content rendered via MDXRemote with custom components */}
      <div className="max-w-none">
        <MDXRemote source={doc.content} components={components as any} />
      </div>

      {/* Prev/Next navigation */}
      <div className="flex flex-col sm:flex-row gap-3 pt-12 border-t border-zinc-100 dark:border-zinc-800">
        {prevDoc ? (
          <Link
            href={`/help/${prevDoc.slug}`}
            className="flex-1 flex items-center gap-4 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-indigo-300 dark:hover:border-indigo-700/50 hover:shadow-lg hover:-translate-y-0.5 transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/30 transition-colors">
              <ArrowLeft className="w-4 h-4 text-zinc-400 group-hover:text-indigo-500 shrink-0 transition-all" />
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Previous</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {prevDoc.title}
              </p>
            </div>
          </Link>
        ) : <div className="flex-1" />}

        {nextDoc && (
          <Link
            href={`/help/${nextDoc.slug}`}
            className="flex-1 flex items-center justify-end gap-4 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-indigo-300 dark:hover:border-indigo-700/50 hover:shadow-lg hover:-translate-y-0.5 transition-all text-right group"
          >
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Next</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {nextDoc.title}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/30 transition-colors">
              <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-indigo-500 shrink-0 transition-all" />
            </div>
          </Link>
        )}
      </div>

      {/* Contact footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-5 p-8 rounded-3xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
          <Mail className="w-24 h-24 -mr-8 -mt-8" />
        </div>
        <div className="relative z-10">
          <h4 className="text-lg font-bold mb-1">Still have questions?</h4>
          <p className="text-zinc-400 dark:text-zinc-500 text-sm font-medium">
            Our support team is just an email away.
          </p>
        </div>
        <a
          href="mailto:admin@bababuilds.com"
          className="relative z-10 px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500 active:scale-95 transition-all shadow-lg shadow-indigo-500/20"
        >
          admin@bababuilds.com
        </a>
      </div>
    </div>
  );
}
