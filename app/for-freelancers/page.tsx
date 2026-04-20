import type { Metadata } from "next";
import PersonaLandingPage from "@/components/landing/persona/PersonaLandingPage";
import { personaConfigs } from "@/components/landing/persona/persona-config";

const persona = personaConfigs["for-freelancers"];
const SITE_URL = "https://erp.bababuilds.com";

export const metadata: Metadata = {
  title: persona.metadata.title,
  description: persona.metadata.description,
  keywords: persona.metadata.keywords,
  alternates: {
    canonical: `${SITE_URL}/for-freelancers`,
  },
  openGraph: {
    title: persona.metadata.title,
    description: persona.metadata.description,
    url: `${SITE_URL}/for-freelancers`,
    siteName: "BabaBuilds ERP",
    locale: "en_IN",
    type: "website",
    images: ["/icons/Banner-1.png"],
  },
};

export default function ForFreelancersPage() {
  return <PersonaLandingPage persona={persona} />;
}
