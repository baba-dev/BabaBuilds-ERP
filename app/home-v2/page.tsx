import type { Metadata } from "next";
import HeroWorkflow from "@/components/landing-v2/HeroWorkflow";
import PainSection from "@/components/landing-v2/PainSection";
import WorkflowSection from "@/components/landing-v2/WorkflowSection";
import RetainerSection from "@/components/landing-v2/RetainerSection";
import PaymentAndReconciliationSection from "@/components/landing-v2/PaymentAndReconciliationSection";
import AIQuestionsSection from "@/components/landing-v2/AIQuestionsSection";
import CAReadySection from "@/components/landing-v2/CAReadySection";
import PricingSection from "@/components/landing-v2/PricingSection";
import FAQSection from "@/components/landing-v2/FAQSection";
import FinalCTA from "@/components/landing-v2/FinalCTA";

const SITE_URL = "https://erp.bababuilds.com";
const PAGE_URL = `${SITE_URL}/home-v2`;

export const metadata: Metadata = {
  title: "BabaBuilds ERP | Proposal-to-Payment Workflow",
  description:
    "Send proposals, collect e-signatures, create invoices, share payment links, match bank entries, and export CA-ready records in one workspace.",
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: "BabaBuilds ERP | Proposal-to-Payment Workflow",
    description:
      "Proposal → E-signature → Invoice → Payment Link → Bank Match → CA Export.",
    url: PAGE_URL,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BabaBuilds ERP | Proposal-to-Payment Workflow",
    description:
      "Proposal → E-signature → Invoice → Payment Link → Bank Match → CA Export.",
  },
};

export default function HomeV2Page() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <HeroWorkflow />
      <PainSection />
      <WorkflowSection />
      <RetainerSection />
      <PaymentAndReconciliationSection />
      <AIQuestionsSection />
      <CAReadySection />
      <PricingSection />
      <FAQSection />
      <FinalCTA />
    </main>
  );
}
