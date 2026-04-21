import type { Metadata } from "next";
import ResellerLandingClient from "./reseller-landing-client";

export const metadata: Metadata = {
  title: "BabaBuilds ERP Reseller Program",
  description:
    "Join the BabaBuilds ERP reseller program. Offer clients a first-year discount, earn commissions, and get partner enablement support.",
  alternates: {
    canonical: "https://erp.bababuilds.com/reseller",
  },
};

export default function ResellerPage() {
  return <ResellerLandingClient />;
}
