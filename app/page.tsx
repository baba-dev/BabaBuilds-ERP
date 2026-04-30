import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LandingContent from "@/components/LandingContent";

const SITE_URL = "https://erp.bababuilds.com";

export async function generateMetadata(): Promise<Metadata> {
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
      locale: "en_IN",
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
  const faqItems = (t.raw("items") as Array<{ question: string; answer: string }>).filter(
    (item): item is { question: string; answer: string } =>
      Boolean(item) && typeof item.question === "string" && typeof item.answer === "string",
  );
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <LandingContent />
    </>
  );
}
