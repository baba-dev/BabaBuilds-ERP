import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ResellerLandingClient from "./reseller-landing-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ResellerLanding.metadata");
  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: "https://erp.bababuilds.com/reseller",
    },
  };
}

export default function ResellerPage() {
  return <ResellerLandingClient />;
}
