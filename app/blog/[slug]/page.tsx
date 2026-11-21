import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAllBlogPosts, getBlogPost } from "@/lib/blog";
import { blogMdxComponents } from "../_components/mdx";

const SITE_URL = "https://erp.bababuilds.com";
type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAllBlogPosts().map(({ slug }) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getBlogPost((await params).slug);
  if (!post) return {};
  const url = `/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    keywords: post.tags,
    authors: [{ name: post.author }],
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      siteName: "BabaBuilds ERP",
      locale: "en_IN",
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified,
      tags: post.tags,
      images: [{ url: post.image.src, width: post.image.width, height: post.image.height, alt: post.image.alt }],
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.description, images: [post.image.src] },
  };
}

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "UTC" });

export default async function BlogPostPage({ params }: Props) {
  const post = getBlogPost((await params).slug);
  if (!post) notFound();
  const url = `${SITE_URL}/blog/${post.slug}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      url,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      image: new URL(post.image.src, SITE_URL).href,
      datePublished: post.datePublished,
      dateModified: post.dateModified,
      inLanguage: "en-IN",
      keywords: post.tags.join(", "),
      author: { "@type": "Organization", name: post.author, url: SITE_URL },
      publisher: { "@type": "Organization", name: "BabaBuilds", url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/icons/BabaBuillds_ERP_Logo.png` } },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: "Home", href: "/" },
        { name: "Blog", href: "/blog" },
        { name: post.title, href: `/blog/${post.slug}` },
      ].map(({ name, href }, i) => ({ "@type": "ListItem", position: i + 1, name, item: new URL(href, SITE_URL).href })),
    },
  ];

  return (
    <article lang="en-IN" dir="ltr">
      {jsonLd.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
      ))}
      <header className="border-b border-border bg-orange-50/70 dark:bg-orange-950/20">
        <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-orange-700 hover:underline dark:text-orange-300">
            <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" /> All articles
          </Link>
          <h1 className="mt-5 text-balance text-4xl font-black leading-tight tracking-tight text-foreground sm:text-5xl">{post.title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-body">{post.description}</p>
          <p className="mt-6 text-sm text-muted-body">
            By {post.author} · <time dateTime={post.datePublished}>{dateFormat.format(new Date(post.datePublished))}</time> · {post.readMinutes} min read
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 pb-8 pt-4">
        <MDXRemote source={post.content} components={blogMdxComponents} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
        <aside className="mt-14 rounded-3xl border border-orange-200 bg-orange-50/70 p-8 dark:border-orange-900 dark:bg-orange-950/20">
          <h2 className="text-2xl font-black tracking-tight text-foreground">See the designs on your own invoice</h2>
          <p className="mt-3 text-lg leading-relaxed text-muted-body">Start a free trial, then open Settings → Invoicing → Compare all designs.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/signup?plan=pro&cycle=monthly&trial=15&source=blog-invoice-designs">Start free trial <ArrowRight aria-hidden="true" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/features/invoice-designs">Explore the feature</Link></Button>
          </div>
        </aside>
      </div>
    </article>
  );
}
