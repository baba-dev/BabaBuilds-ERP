import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import LegacyLandingPage from "@/components/landing-legacy/LegacyLandingPage";

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

export default function LandingPage() {
  return <LegacyLandingPage />;
}
