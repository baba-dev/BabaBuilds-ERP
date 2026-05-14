import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import FreeErpArticle from "@/components/landing/FreeErpArticle";
import MarketingFaqJsonLd from "@/components/landing/MarketingFaqJsonLd";
import { getSeatLimit } from "@/lib/permissions";
import {
  FREE_TIER_CLIENT_LIMIT,
  FREE_TIER_MONTHLY_INVOICE_LIMIT,
  FREE_TIER_PUBLISHED_SERVICES_LIMIT,
} from "@/lib/pricing";

const canonicalUrl = "https://erp.bababuilds.com/free-erp";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("LandingFreeErp.metadata");
  const title = t("title");
  const description = t("description");
  const keywords = t
    .raw("keywords")
    .filter((keyword: unknown): keyword is string => typeof keyword === "string");

  return {
    title,
    description,
    keywords,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      locale: locale.replace("-", "_"),
      type: "article",
      publishedTime: "2026-05-14T00:00:00.000Z",
      modifiedTime: "2026-05-14T00:00:00.000Z",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function FreeErpPage() {
  const t = await getTranslations("LandingFreeErp.metadata");
  const title = t("title");
  const description = t("description");
  const webPageLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: canonicalUrl,
    dateModified: "2026-05-14",
    publisher: {
      "@type": "Organization",
      name: "BabaBuilds",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd) }} />
      <MarketingFaqJsonLd messageRoot="LandingFreeErp" />
      <FreeErpArticle
        limits={{
          clients: FREE_TIER_CLIENT_LIMIT,
          monthlyInvoices: FREE_TIER_MONTHLY_INVOICE_LIMIT,
          shopServices: FREE_TIER_PUBLISHED_SERVICES_LIMIT,
          seats: getSeatLimit("FREE"),
        }}
      />
    </>
  );
}
