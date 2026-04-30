import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PersonaLandingPage from "@/components/landing/persona/PersonaLandingPage";
import { personaConfigs } from "@/components/landing/persona/persona-config";

const persona = personaConfigs["for-contractors"];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LandingPersona.forContractors.metadata");

  return {
    title: t("title"),
    description: t("description"),
    keywords: t.raw("keywords") as string[],
    alternates: {
      canonical: "https://erp.bababuilds.com/for-contractors",
    },
  };
}

export default function ForContractorsPage() {
  return <PersonaLandingPage persona={persona} />;
}
