import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { RetainerComposer } from "../_composer/RetainerComposer";

export const metadata: Metadata = { title: "New retainer" };

export default async function NewRetainerPage() {
  const t = await getTranslations("RetainersHub.composer");
  return (
    <DashboardPageShell
      title={t("newTitle")}
      description={t("newDescription")}
      breadcrumb={<Link href="/retainers" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t("back")}</Link>}
      animated={false}
      maxWidthClassName="max-w-6xl"
    >
      <Suspense fallback={null}><RetainerComposer /></Suspense>
    </DashboardPageShell>
  );
}
