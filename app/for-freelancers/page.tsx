import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PersonaLandingPage from "@/components/landing/persona/PersonaLandingPage";
import { personaConfigs } from "@/components/landing/persona/persona-config";

const persona = personaConfigs["for-freelancers"];
const SITE_URL = "https://erp.bababuilds.com";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LandingPersona.forFreelancers.metadata");
  const title = t("title");
  const description = t("description");
  const keywords = (t.raw("keywords") as unknown[]).filter(
    (keyword): keyword is string => typeof keyword === "string",
  );

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: `${SITE_URL}/for-freelancers`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/for-freelancers`,
      siteName: "BabaBuilds ERP",
      locale: "en_IN",
      type: "website",
      images: ["/icons/Banner-1.png"],
    },
  };
}

export default function ForFreelancersPage() {
  return <PersonaLandingPage persona={persona} />;
}
