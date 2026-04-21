import type { Metadata } from "next";
import { getAllDocs } from "@/lib/docs";
import { HelpSidebar } from "./HelpSidebar";

const HELP_URL = "https://erp.bababuilds.com/help";

export const metadata: Metadata = {
  title: "Help Center \u2014 BabaBuilds ERP",
  description:
    "Guides, tutorials and documentation for BabaBuilds ERP. Learn how to generate invoices, manage clients, set up Razorpay & Stripe payments, configure GST/VAT, and reconcile bank statements.",
  alternates: {
    canonical: HELP_URL,
  },
};

export default async function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const docs = getAllDocs();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex">
      <HelpSidebar docs={docs} />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto px-4 py-8 lg:px-8 lg:py-10">
          {children}
        </div>
      </div>
    </div>
  );
}
