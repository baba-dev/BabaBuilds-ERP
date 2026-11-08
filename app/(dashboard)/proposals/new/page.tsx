import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { ProposalComposer } from "../_composer/ProposalComposer";

export const metadata: Metadata = { title: "New proposal" };

export default async function NewProposalPage() {
  const t = await getTranslations("ProposalsHub.composer");
  return (
    <DashboardPageShell
      title={t("newTitle")}
      description={t("newDescription")}
      breadcrumb={
        <Link href="/proposals" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t("back")}
        </Link>
      }
      animated={false}
      maxWidthClassName="max-w-6xl"
    >
      <ProposalComposer />
    </DashboardPageShell>
  );
}
