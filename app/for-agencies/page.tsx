import type { Metadata } from "next";
import PersonaLandingPage from "@/components/landing/persona/PersonaLandingPage";
import { personaConfigs } from "@/components/landing/persona/persona-config";

const persona = personaConfigs["for-agencies"];

export const metadata: Metadata = {
  title: persona.metadata.title,
  description: persona.metadata.description,
  keywords: persona.metadata.keywords,
  alternates: {
    canonical: "https://erp.bababuilds.com/for-agencies",
  },
  openGraph: {
    title: persona.metadata.title,
    description: persona.metadata.description,
    url: "https://erp.bababuilds.com/for-agencies",
    type: "website",
  },
};

export default function ForAgenciesPage() {
  return <PersonaLandingPage persona={persona} />;
}
