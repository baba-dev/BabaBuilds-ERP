import type { Metadata } from "next";
import { getAllDocs } from "@/lib/docs";
import { HelpSidebar } from "./HelpSidebar";

export const metadata: Metadata = {
  title: "Help Center — BabaBuilds ERP",
  description: "Guides, tutorials and documentation for BabaBuilds ERP. Learn how to generate invoices, manage clients, set up payments, and more.",
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
        <div className="max-w-3xl mx-auto px-6 py-10 lg:px-12 lg:py-14">
          {children}
        </div>
      </div>
    </div>
  );
}
