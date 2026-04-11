"use client";

import { useTranslations } from "next-intl";
import { useFormat } from "@/hooks/use-format";
import { useMemo } from "react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import InvoiceGeneratorForm from "@/components/invoice/InvoiceGeneratorForm";

/** Standalone /invoice page — kept alive for redirects, bookmarks, and offline sync queues.
 *  All logic lives in the shared InvoiceGeneratorForm component. */
export default function InvoiceGenerator() {
  const t = useTranslations("Invoice");
  const { countryCode = "Global" } = useFormat();

  return (
    <DashboardPageShell
      title={t("title")}
      description={t("description", { countryCode })}
      maxWidthClassName="max-w-4xl"
    >
      <InvoiceGeneratorForm />
    </DashboardPageShell>
  );
}
