import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { RetainerComposer } from "../../_composer/RetainerComposer";

export const metadata: Metadata = { title: "Edit retainer" };

export default async function EditRetainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("RetainersHub.composer");
  return (
    <DashboardPageShell
      title={t("editTitle")}
      description={t("editDescription")}
      breadcrumb={<Link href={`/retainers?retainer=${encodeURIComponent(id)}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t("back")}</Link>}
      animated={false}
      maxWidthClassName="max-w-6xl"
    >
      <Suspense fallback={null}><RetainerComposer retainerId={id} /></Suspense>
    </DashboardPageShell>
  );
}
