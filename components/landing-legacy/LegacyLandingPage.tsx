import { getTranslations, getLocale } from "next-intl/server";
import LandingContent from "@/components/LandingContent";

const SITE_URL = "https://erp.bababuilds.com";

export default async function LegacyLandingPage() {
  const t = await getTranslations("LandingPageSeo.faq");
  const seo = await getTranslations("LandingPageSeo");
  const locale = await getLocale();
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
      name: seo("schema.tryActionName"),
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: seo("schema.offerDescription"),
    },
    featureList: seo.raw("schema.featureList") as string[],
    url: SITE_URL,
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "BabaBuilds ERP",
    url: SITE_URL,
    inLanguage: locale,
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
