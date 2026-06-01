import type { Metadata } from "next";
import LandingNavbar from "@/components/LandingNavbar";
import LandingFooter from "@/components/LandingFooter";
import HeroV3 from "@/components/landing-v3/HeroV3";
import InteractiveDemoV3 from "@/components/landing-v3/InteractiveDemoV3";
import FeaturesBentoV3 from "@/components/landing-v3/FeaturesBentoV3";
import PricingRealtimeV3 from "@/components/landing-v3/PricingRealtimeV3";
import FinalCTAV3 from "@/components/landing-v3/FinalCTAV3";

const SITE_URL = "https://erp.bababuilds.com";
const PAGE_URL = `${SITE_URL}/home-v3`;

export const metadata: Metadata = {
  title: "BabaBuilds ERP | The Modern Operating System for Business",
  description:
    "Everything you need to run your business: proposals, invoicing, automated AR, bank reconciliation, tax, payroll, and more. Sign up for free today.",
  keywords: ["ERP", "Invoicing", "Bank Reconciliation", "Payroll", "Tax Engine", "Small Business Software"],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "BabaBuilds ERP | The Modern Operating System for Business",
    description: "Invoicing, automated AR, bank reconciliation, tax, and payroll in one powerful platform.",
    url: PAGE_URL,
    siteName: "BabaBuilds ERP",
    images: [
      {
        url: "/icons/Banner-1.png",
        width: 1536,
        height: 1024,
        alt: "BabaBuilds ERP Dashboard",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BabaBuilds ERP | The Modern Operating System for Business",
    description: "Invoicing, automated AR, bank reconciliation, tax, and payroll in one powerful platform.",
    images: ["/icons/Banner-1.png"],
    creator: "@bababuilds",
  },
};

export default function HomeV3Page() {
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "BabaBuilds ERP",
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512x512.png`,
    sameAs: ["https://www.linkedin.com/company/bababuilds", "https://x.com/bababuilds"],
  };

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "BabaBuilds ERP",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: "Proposals, invoicing, automated AR, bank reconciliation, tax, and payroll—all in one vibrant, lightning-fast platform designed to help you grow.",
    potentialAction: {
      "@type": "TryAction",
      target: `${SITE_URL}/signup?plan=pro&trial=15`,
      name: "Start free trial",
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "15-day trial for new workspaces",
    },
    featureList: [
      "Invoicing and proposals",
      "Cash flow and expense tracking",
      "Multi-currency support",
      "Tax and compliance workflows",
    ],
    url: SITE_URL,
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "BabaBuilds ERP",
    url: SITE_URL,
    inLanguage: "en",
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
      
      <LandingNavbar />
      <main className="flex flex-col gap-12 pb-14 pt-28 md:pt-32">
        <HeroV3 />
        <InteractiveDemoV3 />
        <FeaturesBentoV3 />
        <PricingRealtimeV3 />
        <FinalCTAV3 />
      </main>
      <LandingFooter />
    </>
  );
}
