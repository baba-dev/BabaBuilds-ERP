import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAllBlogPosts } from "@/lib/blog";

const title = "BabaBuilds ERP Blog: Invoicing, GST and Getting Paid";
const description = "Practical guides for Indian freelancers and small businesses on invoicing, GST, TDS, UPI payments and running a tidy back office.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/blog" },
  openGraph: { title, description, url: "/blog", type: "website", siteName: "BabaBuilds ERP", locale: "en_IN" },
  twitter: { card: "summary", title, description },
};

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "UTC" });

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();
  return (
    <div lang="en-IN" dir="ltr">
      <header className="border-b border-border bg-orange-50/70 dark:bg-orange-950/20">
        <div className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
          <p className="text-sm font-bold uppercase tracking-widest text-orange-700 dark:text-orange-300">Blog</p>
          <h1 className="mt-3 max-w-3xl text-balance text-4xl font-black tracking-tight text-foreground sm:text-5xl">Invoicing, GST and getting paid</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-body">{description}</p>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        {posts.length === 0 ? (
          <p className="text-muted-body">New articles are on the way.</p>
        ) : (
          <ul className="grid gap-8 md:grid-cols-2">
            {posts.map((post, index) => (
              <li key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-sm transition-colors hover:border-orange-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600"
                >
                  <Image src={post.image.src} alt={post.image.alt} width={post.image.width} height={post.image.height} priority={index === 0} sizes="(min-width: 768px) 480px, 100vw" className="h-auto w-full border-b border-border" />
                  <div className="flex flex-1 flex-col p-6">
                    <p className="text-sm text-muted-body">
                      <time dateTime={post.datePublished}>{dateFormat.format(new Date(post.datePublished))}</time> · {post.readMinutes} min read
                    </p>
                    <h2 className="mt-2 text-balance text-2xl font-bold leading-snug text-foreground">{post.title}</h2>
                    <p className="mt-3 flex-1 leading-relaxed text-muted-body">{post.description}</p>
                    <span className="mt-5 inline-flex items-center gap-2 font-semibold text-orange-700 dark:text-orange-300">
                      Read the article <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
