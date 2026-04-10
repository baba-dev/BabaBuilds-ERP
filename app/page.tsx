import type { Metadata } from "next";
import LandingContent from "@/components/LandingContent";

const SITE_URL = "https://erp.bababuilds.com";

export const metadata: Metadata = {
  title: "BabaBuilds ERP | Automated Invoicing, Reconciliation & Tax Compliance",
  description:
    "The global command center for bookkeeping and growth. Automate multi-currency invoices, manage clients, reconcile bank statements with AI, and stay GST/VAT compliant — built for agencies, freelancers, and MSMEs.",
  keywords: [
    "Invoices",
    "Reconcile",
    "ERP for Freelancers",
    "Automated Bookkeeping",
    "GST Compliance",
    "VAT Compliance Oman",
    "MSME Registered",
    "Multi-currency Invoicing",
    "Bank Reconciliation",
  ],
  alternates: {
    canonical: SITE_URL,
    languages: {
      "en-IN": SITE_URL,
      "hi": SITE_URL,
      "ar": SITE_URL,
      "es": SITE_URL,
      "x-default": SITE_URL,
    },
  },
  openGraph: {
    title: "BabaBuilds ERP | Run Your Agency on Autopilot",
    description:
      "Multi-currency invoicing, AI-powered financial insights, and global tax compliance for modern agencies.",
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
    title: "BabaBuilds ERP | Automated Invoicing & Compliance",
    description: "The global command center for bookkeeping and growth.",
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
        text: "BabaBuilds ERP is an all-in-one financial management platform for agencies and freelancers. It automates multi-currency invoicing, GST/VAT tax compliance, AI-powered bank reconciliation, retainer tracking, and real-time dashboards.",
      },
    },
    {
      "@type": "Question",
      name: "Does BabaBuilds ERP support GST and VAT compliance?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. BabaBuilds ERP automatically calculates GST (India), VAT (Oman, GCC), and supports zero-rated export invoicing. Tax rates are configurable per jurisdiction and client type.",
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
        text: "BabaBuilds ERP offers a free tier for solo freelancers. Team and enterprise plans with advanced features like CA portal access, audit ledger, and push notifications are available as paid upgrades.",
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
