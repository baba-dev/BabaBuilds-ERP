import type { Metadata } from "next";
import PersonaLandingPage from "@/components/landing/persona/PersonaLandingPage";
import { personaConfigs } from "@/components/landing/persona/persona-config";

const persona = personaConfigs["for-contractors"];

export const metadata: Metadata = {
  title: persona.metadata.title,
  description: persona.metadata.description,
  keywords: persona.metadata.keywords,
  alternates: {
    canonical: "https://erp.bababuilds.com/for-contractors",
  },
};

export default function ForContractorsPage() {
  return <PersonaLandingPage persona={persona} />;
}
