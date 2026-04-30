import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PersonaLandingPage from "@/components/landing/persona/PersonaLandingPage";
import { personaConfigs } from "@/components/landing/persona/persona-config";

const persona = personaConfigs["for-ca"];
const canonicalUrl = `https://erp.bababuilds.com/${persona.slug}`;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LandingPersona");
  const title = t(`${persona.namespace}.metadata.title`);
  const description = t(`${persona.namespace}.metadata.description`);
  const keywords = t
    .raw(`${persona.namespace}.metadata.keywords`)
    .filter((keyword: unknown): keyword is string => typeof keyword === "string");

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "website",
    },
  };
}

export default function ForCaPage() {
  return <PersonaLandingPage persona={persona} />;
}
