import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { ProposalComposer } from "../../_composer/ProposalComposer";

export const metadata: Metadata = { title: "Edit proposal" };

export default async function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("ProposalsHub.composer");
  return (
    <DashboardPageShell
      title={t("editTitle")}
      description={t("editDescription")}
      breadcrumb={
        <Link href={`/proposals?proposal=${encodeURIComponent(id)}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t("back")}
        </Link>
      }
      animated={false}
      maxWidthClassName="max-w-6xl"
    >
      <ProposalComposer proposalId={id} />
    </DashboardPageShell>
  );
}
