import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PersonaLandingPage from "@/components/landing/persona/PersonaLandingPage";
import { personaConfigs } from "@/components/landing/persona/persona-config";

const persona = personaConfigs["for-agencies"];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LandingPersona.forAgencies.metadata");
  return {
    title: t("title"),
    description: t("description"),
    keywords: t.raw("keywords") as string[],
    alternates: {
      canonical: "https://erp.bababuilds.com/for-agencies",
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      url: "https://erp.bababuilds.com/for-agencies",
      type: "website",
    },
  };
}

export default function ForAgenciesPage() {
  return <PersonaLandingPage persona={persona} />;
}
