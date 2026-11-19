import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { erpFeatures } from "@/content/marketing/erp-features";
import { featureHref, FEATURES_PATH } from "@/content/marketing/feature-paths";

const SITE_URL = "https://erp.bababuilds.com";
const textLink = "inline-flex min-h-11 items-center gap-2 font-semibold text-orange-800 underline underline-offset-4 hover:no-underline dark:text-orange-300";

type FeaturePageProps = { params: Promise<{ slug: string }> };

async function getFeature(params: FeaturePageProps["params"]) {
  const { slug } = await params;
  const feature = erpFeatures.find((item) => item.slug === slug);
  if (!feature) notFound();
  return feature;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return erpFeatures.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: FeaturePageProps): Promise<Metadata> {
  const feature = await getFeature(params);
  const url = featureHref(feature.slug);
  const image = `/product-images/light/${feature.image.file}.png`;
  return {
    title: feature.title,
    description: feature.description,
    alternates: { canonical: url },
    openGraph: {
      title: feature.title,
      description: feature.description,
      url,
      type: "website",
      siteName: "BabaBuilds ERP",
      locale: "en_IN",
      images: [{ url: image, width: 1440, height: 900, alt: feature.image.alt }],
    },
    twitter: {
      card: "summary_large_image",
      title: feature.title,
      description: feature.description,
      images: [image],
    },
  };
}

export default async function FeaturePage({ params }: FeaturePageProps) {
  const feature = await getFeature(params);
  const trialHref = `/signup?plan=pro&cycle=monthly&trial=15&source=feature-${feature.slug}`;
  const screenshot = `/product-images/light/${feature.image.file}.png`;
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Features", href: FEATURES_PATH },
    { name: feature.name, href: featureHref(feature.slug) },
  ];
  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map(({ name, href }, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: new URL(href, SITE_URL).href,
    })),
  };

  return (
    <article lang="en-IN" dir="ltr">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData).replace(/</g, "\\u003c") }} />
      <header className="border-b border-border bg-orange-50/70 dark:bg-orange-950/20">
        <div className="mx-auto max-w-7xl px-6 pb-12 sm:pb-16">
          <nav aria-label="Breadcrumb" className="py-4">
            <ol className="flex flex-wrap items-center gap-x-2 text-sm text-muted-body">
              {crumbs.slice(0, -1).map(({ name, href }) => (
                <li key={href} className="flex items-center gap-2">
                  <Link href={href} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">{name}</Link>
                  <ChevronRight aria-hidden="true" className="size-3" />
                </li>
              ))}
              <li aria-current="page" className="font-semibold text-foreground">{feature.name}</li>
            </ol>
          </nav>
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-12">
            <div>
              <h1 className="text-balance text-4xl font-black leading-tight tracking-tight text-foreground sm:text-5xl xl:text-6xl">
                {feature.headline}
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-body">{feature.intro}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button size="lg" asChild><Link href={trialHref}>Start a free trial <ArrowRight aria-hidden="true" /></Link></Button>
                <Button variant="outline" size="lg" asChild><Link href="#workflow">See how it works</Link></Button>
              </div>
            </div>
            <figure className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-lg">
              <Link href={screenshot} aria-label={`View larger screenshot: ${feature.image.alt}`} className="block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-600">
                <Image
                  src={screenshot}
                  alt={feature.image.alt}
                  width={1440}
                  height={900}
                  sizes="(min-width: 1280px) 620px, (min-width: 1024px) 50vw, calc(100vw - 48px)"
                  loading="eager"
                  className="h-auto w-full"
                />
              </Link>
              <figcaption className="border-t border-border px-4 py-2 text-sm text-muted-body">BabaBuilds ERP with sample data. Select the image to enlarge it.</figcaption>
            </figure>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
        <div className="grid gap-5 md:grid-cols-2">
          {[feature.problem, feature.solution].map(({ title, text }) => (
            <section key={title} className="rounded-2xl border border-border bg-surface-elevated p-6 sm:p-8">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
              <p className="mt-3 leading-relaxed text-muted-body">{text}</p>
            </section>
          ))}
        </div>

        <section id="workflow" className="mt-14 scroll-mt-28">
          <h2 className="text-3xl font-black tracking-tight text-foreground">How it works</h2>
          <ol className="mt-5 grid gap-4 md:grid-cols-3">
            {feature.steps.map(({ title, text }, index) => (
              <li key={title} className="rounded-2xl border border-border bg-surface-elevated p-6">
                <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-900 dark:bg-orange-950 dark:text-orange-200">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-bold text-foreground">{title}</h3>
                <p className="mt-2 leading-relaxed text-muted-body">{text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-6 dark:border-orange-900 dark:bg-orange-950/30 sm:p-8">
            <h3 className="text-xl font-bold text-foreground">{feature.example.title}</h3>
            <p className="mt-2 max-w-3xl leading-relaxed text-muted-body">{feature.example.text}</p>
          </div>
          <Link href={`/help/${feature.guide}`} className={`${textLink} mt-3`}>
            {feature.guideLabel ?? `Read the ${feature.name.toLowerCase()} guide`} <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </section>

        <section className="mt-12">
          <h2 className="text-3xl font-black tracking-tight text-foreground">Frequently asked questions</h2>
          <div className="mt-5 max-w-3xl divide-y divide-border rounded-2xl border border-border bg-surface-elevated">
            {feature.faqs.map(({ title, text }) => (
              <details key={title} className="group px-5 sm:px-6">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 [&::-webkit-details-marker]:hidden">
                  {title}
                  <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-body group-open:rotate-180" />
                </summary>
                <p className="pb-5 leading-relaxed text-muted-body">{text}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-12 flex flex-wrap items-center gap-3 border-y border-border py-6">
          <Button size="lg" asChild><Link href={trialHref}>Start a free trial <ArrowRight aria-hidden="true" /></Link></Button>
          <Button variant="outline" size="lg" asChild><Link href="/#demo-launcher">Explore the live demo</Link></Button>
        </div>

        <nav aria-label="Related features" className="mt-9">
          <h2 className="text-xl font-bold text-foreground">Related features</h2>
          <ul className="mt-1 flex flex-wrap gap-x-6">
            {erpFeatures.filter(({ slug }) => feature.related.includes(slug)).map(({ slug, name }) => (
              <li key={slug}><Link className={textLink} href={featureHref(slug)}>{name} <ArrowRight aria-hidden="true" className="size-4" /></Link></li>
            ))}
          </ul>
        </nav>
      </div>
    </article>
  );
}
