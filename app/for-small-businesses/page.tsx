import type { Metadata } from "next";
import PersonaLandingPage from "@/components/landing/persona/PersonaLandingPage";
import { personaConfigs } from "@/components/landing/persona/persona-config";

const persona = personaConfigs["for-small-businesses"];
const canonicalUrl = "https://erp.bababuilds.com/for-small-businesses";

export const metadata: Metadata = {
  title: persona.metadata.title,
  description: persona.metadata.description,
  keywords: persona.metadata.keywords,
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title: persona.metadata.title,
    description: persona.metadata.description,
    url: canonicalUrl,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: persona.metadata.title,
    description: persona.metadata.description,
  },
};

export default function SmallBusinessLandingPage() {
  return <PersonaLandingPage persona={persona} />;
}
