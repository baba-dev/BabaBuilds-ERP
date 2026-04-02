import type { Metadata } from "next";
import LandingContent from "@/components/LandingContent";

export const metadata: Metadata = {
  title: "BabaBuilds ERP | Automated Invoicing, Reconcile & Compliance",
  description: "The global command center for bookkeeping and growth. Automate invoices, manage clients, and track expenses with WCAG 2.2 Level AA compliance.",
  keywords: ["Invoices", "Reconcile", "ERP for Freelancers", "Automated Bookkeeping", "GST Compliance", "MSME Registered"],
  openGraph: {
    title: "BabaBuilds ERP | Run Your Agency on Autopilot",
    description: "Multi-currency invoicing, AI-powered financial insights, and global tax compliance for modern agencies.",
    url: "https://erp.bababuilds.com",
    siteName: "BabaBuilds ERP",
    images: [
      {
        url: "/og-image.png", // Ensure this exists or provide a fallback
        width: 1200,
        height: 630,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BabaBuilds ERP | Automated Invoicing & Compliance",
    description: "The global command center for bookkeeping and growth.",
    images: ["/og-image.png"],
  },
};

export default function LandingPage() {
  return <LandingContent />;
}
