import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { coreErpFeatures, type ErpFeature } from "@/content/marketing/erp-features";
import { optionalErpFeatures } from "@/content/marketing/optional-erp-features";
import { featureHref, FEATURES_PATH, OPTIONAL_MODULES_PATH } from "@/content/marketing/feature-paths";

const title = "ERP Features for Small Businesses";
const description = "Explore core BabaBuilds ERP workflows and optional modules for point of sale, online storefronts, payroll, collections, cash flow, and more.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: FEATURES_PATH },
  openGraph: { title, description, url: FEATURES_PATH, type: "website", siteName: "BabaBuilds ERP" },
  twitter: { card: "summary", title, description },
};

export default function FeaturesPage() {
  return (
    <div lang="en-IN" dir="ltr">
      <header className="border-b border-border bg-orange-50/70 dark:bg-orange-950/20">
        <div className="mx-auto max-w-7xl px-6 py-14 sm:py-20">
          <h1 className="max-w-3xl text-balance text-4xl font-black tracking-tight text-foreground sm:text-6xl">
            ERP features for the work that slows your team down
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-body">
            See how BabaBuilds ERP helps you bill clients, track stock, and make sense of the money coming in and going out. Start with the workflow you need to fix.
          </p>
          <Button asChild variant="outline" size="lg" className="mt-6">
            <Link href={OPTIONAL_MODULES_PATH}>Explore optional modules <ArrowRight aria-hidden="true" /></Link>
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
        <section aria-labelledby="core-features-heading">
          <h2 id="core-features-heading" className="mb-5 text-3xl font-black tracking-tight text-foreground">Core workflows</h2>
          <FeatureCards features={coreErpFeatures} />
        </section>
        <section id="optional-modules" aria-labelledby="optional-modules-heading" className="mt-14 scroll-mt-28 border-t border-border pt-10">
          <h2 id="optional-modules-heading" className="text-3xl font-black tracking-tight text-foreground">Optional modules</h2>
          <p className="mb-5 mt-2 max-w-2xl text-muted-body">
            Add tools for the way you sell, manage your team, or run finance. Availability depends on your plan and workspace settings.
          </p>
          <FeatureCards features={optionalErpFeatures} />
        </section>
        <div className="mt-10">
          <Button asChild size="lg">
            <Link href="/#demo-launcher">Explore the live demo <ArrowRight aria-hidden="true" /></Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function FeatureCards({ features }: { features: readonly ErpFeature[] }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((feature) => (
        <li key={feature.slug}>
          <Link
            href={featureHref(feature.slug)}
            className="group flex h-full flex-col rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm transition-colors hover:border-orange-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600"
          >
            <h3 className="text-xl font-bold text-foreground">{feature.name}</h3>
            <p className="mt-3 flex-1 leading-relaxed text-muted-body">{feature.description}</p>
            <ArrowRight aria-hidden="true" className="mt-5 size-5 text-orange-700 dark:text-orange-300" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
