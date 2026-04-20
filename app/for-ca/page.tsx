import type { Metadata } from "next";
import PersonaLandingPage from "@/components/landing/persona/PersonaLandingPage";
import { personaConfigs } from "@/components/landing/persona/persona-config";

const persona = personaConfigs["for-ca"];
const canonicalUrl = `https://erp.bababuilds.com/${persona.slug}`;

export const metadata: Metadata = {
  title: persona.metadata.title,
  description: persona.metadata.description,
  keywords: persona.metadata.keywords,
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: persona.metadata.title,
    description: persona.metadata.description,
    url: canonicalUrl,
    type: "website",
  },
};

export default function ForCaPage() {
  return <PersonaLandingPage persona={persona} />;
}
