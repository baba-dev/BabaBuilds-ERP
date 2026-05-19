import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import LandingContent from "@/components/LandingContent";

const SITE_URL = "https://erp.bababuilds.com";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("LandingPageSeo");
  const keywords = (t.raw("keywords") as unknown[]).filter(
    (keyword): keyword is string => typeof keyword === "string",
  );
  return {
    title: t("title"),
    description: t("description"),
    keywords,
    alternates: {
      canonical: SITE_URL,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: t("openGraph.title"),
      description: t("openGraph.description"),
      url: SITE_URL,
      siteName: "BabaBuilds ERP",
      images: [
        {
          url: "/icons/Banner-1.png",
          width: 1536,
          height: 1024,
          alt: t("openGraph.imageAlt"),
        },
      ],
      locale: locale.replace("-", "_"),
      alternateLocale: ["hi_IN", "ar_OM", "es_MX"],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t("twitter.title"),
      description: t("twitter.description"),
      images: ["/icons/Banner-1.png"],
      creator: "@bababuilds",
    },
  };
}

export default async function LandingPage() {
  const t = await getTranslations("LandingPageSeo.faq");
  const seo = await getTranslations("LandingPageSeo");
  const faqItems = (t.raw("items") as Array<{ question: string; answer: string }>).filter(
    (item): item is { question: string; answer: string } =>
      Boolean(item) && typeof item.question === "string" && typeof item.answer === "string",
  );
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "BabaBuilds ERP",
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512x512.png`,
    sameAs: ["https://www.linkedin.com/company/bababuilds", "https://x.com/bababuilds"],
  };
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "BabaBuilds ERP",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: seo("description"),
    potentialAction: {
      "@type": "TryAction",
      target: `${SITE_URL}/signup?plan=pro&trial=15`,
      name: "Start free trial",
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "15-day trial for new workspaces",
    },
    featureList: [
      "Invoicing and proposals",
      "Cash flow and expense tracking",
      "Multi-currency support",
      "Tax and compliance workflows",
    ],
    url: SITE_URL,
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "BabaBuilds ERP",
    url: SITE_URL,
    inLanguage: "en",
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <LandingContent />
    </>
  );
}
