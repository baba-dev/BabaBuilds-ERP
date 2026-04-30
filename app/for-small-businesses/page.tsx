import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PersonaLandingPage from "@/components/landing/persona/PersonaLandingPage";
import { personaConfigs } from "@/components/landing/persona/persona-config";

const persona = personaConfigs["for-small-businesses"];
const canonicalUrl = "https://erp.bababuilds.com/for-small-businesses";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LandingPersona.forSmallBusinesses.metadata");
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
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function SmallBusinessLandingPage() {
  return <PersonaLandingPage persona={persona} />;
}
