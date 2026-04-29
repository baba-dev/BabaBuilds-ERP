import type { Metadata } from "next";
import LandingContent from "@/components/LandingContent";

const SITE_URL = "https://erp.bababuilds.com";

export const metadata: Metadata = {
  title: "BabaBuilds ERP | Start 15-Day Trial or Explore Interactive Demo",
  description:
    "Conversion-first ERP for agencies, accountants, contractors, freelancers, and service businesses. Start a 15-day Pro trial or jump into a role-based interactive demo with seeded data.",
  keywords: [
    "Invoices",
    "Reconcile",
    "ERP for Freelancers",
    "Automated Bookkeeping",
    "GST Compliance",
    "VAT setup Oman",
    "VAT setup UAE",
    "VAT setup Saudi Arabia",
    "MSME Registered",
    "Multi-currency Invoicing",
    "Bank Reconciliation",
  ],
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "BabaBuilds ERP | Trial + Interactive Persona Demos",
    description:
      "Pick your role, explore a seeded live demo instantly, or start your 15-day Pro trial.",
    url: SITE_URL,
    siteName: "BabaBuilds ERP",
    images: [
      {
        url: "/icons/Banner-1.png",
        width: 1536,
        height: 1024,
        alt: "BabaBuilds ERP — Invoicing, Reconciliation & Compliance Dashboard",
      },
    ],
    locale: "en_IN",
    alternateLocale: ["hi_IN", "ar_OM", "es_MX"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BabaBuilds ERP | Start Trial or Explore Demo",
    description: "Role-based ERP demos for CAs, agencies, contractors, freelancers, and SMB teams.",
    images: ["/icons/Banner-1.png"],
    creator: "@bababuilds",
  },
};

// FAQPage structured data for rich snippets
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is BabaBuilds ERP?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "BabaBuilds ERP is an all-in-one financial management platform for agencies and freelancers. It delivers multi-currency invoicing, tax-ready GST/VAT compliance workflows, AI-powered bank reconciliation, retainer tracking, and real-time dashboards.",
      },
    },
    {
      "@type": "Question",
      name: "Does BabaBuilds ERP support GST and VAT compliance?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. BabaBuilds ERP supports GST/VAT workflows with country-aware setup defaults, configurable tax rates, and zero-rated export invoicing. Advanced compliance packs are available for select markets, while additional jurisdictions are supported through core country-aware setup and are being expanded.",
      },
    },
    {
      "@type": "Question",
      name: "Can I use BabaBuilds ERP for multi-currency invoicing?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Absolutely. BabaBuilds ERP supports invoicing in any currency — USD, INR, OMR, EUR, and more — with automatic formatting and live exchange rate awareness.",
      },
    },
    {
      "@type": "Question",
      name: "Is BabaBuilds ERP free to use?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "BabaBuilds ERP offers a free tier with full product access and limits on clients, invoices, and shop listings. Pro and Team add payment gateways, higher seat limits, and more document storage.",
      },
    },
    {
      "@type": "Question",
      name: "Which payment gateways does BabaBuilds ERP integrate with?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "BabaBuilds ERP integrates with Razorpay (for INR payments) and Stripe (for international payments), enabling you to embed payment links directly into your invoices.",
      },
    },
  ],
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <LandingContent />
    </>
  );
}
