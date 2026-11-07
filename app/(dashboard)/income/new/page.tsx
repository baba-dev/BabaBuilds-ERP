import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import InvoiceGeneratorForm from "@/components/invoice/InvoiceGeneratorForm";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  const t = await getTranslations("Income");
  return (
    <DashboardPageShell
      title={t("new.title")}
      description={t("new.description")}
      breadcrumb={
        <Link href="/income" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t("new.back")}
        </Link>
      }
      animated={false}
      maxWidthClassName="max-w-4xl"
    >
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <InvoiceGeneratorForm />
      </div>
    </DashboardPageShell>
  );
}
