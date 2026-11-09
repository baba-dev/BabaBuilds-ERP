"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { HASH_TO_SECTION, type SectionKey } from "@/lib/settings/nav";
import { useSettingsData } from "./settings-data";
import { AiSection } from "./sections/Ai";
import { AppSection } from "./sections/App";
import { AutomationSection } from "./sections/Automation";
import { BankingSection } from "./sections/Banking";
import { BusinessSection } from "./sections/Business";
import { EmailSection } from "./sections/Email";
import { InvoicingSection } from "./sections/Invoicing";
import { ModulesSection } from "./sections/Modules";
import { PaymentsSection } from "./sections/Payments";
import { ShopSection } from "./sections/Shop";
import { TaxSection } from "./sections/Tax";

const SECTIONS = { business: BusinessSection, tax: TaxSection, invoicing: InvoicingSection, banking: BankingSection, modules: ModulesSection, automation: AutomationSection, email: EmailSection, payments: PaymentsSection, shop: ShopSection, ai: AiSection } as const;

export function SettingsHost({ section }: { section: SectionKey }) {
  const t = useTranslations("SettingsHub");
  const router = useRouter();
  const { data, loading, error, reload } = useSettingsData();

  // Old links point at #anchors on the single page; send them to the right section.
  useEffect(() => {
    const target = HASH_TO_SECTION[window.location.hash.replace(/^#/, "")];
    if (target && target !== section) router.replace(`/settings?section=${target}`);
  }, [router, section]);

  return (
    <main className="space-y-5" aria-labelledby="settings-title">
      <header>
        <h1 id="settings-title" className="text-2xl font-bold tracking-tight">{t(`nav.${section}`)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t(`navHint.${section}`)}</p>
      </header>
      {section === "app" ? <AppSection /> : error && !data ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
          {t("loadFailed")} <button type="button" onClick={reload} className="font-semibold underline">{t("retry")}</button>
        </div>
      ) : loading && !data ? (
        <div className="space-y-4"><Skeleton className="h-56 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>
      ) : data ? (
        (() => { const Section = SECTIONS[section as keyof typeof SECTIONS]; return <Section key={section} data={data} canManage={data.canManage !== false} reload={reload} />; })()
      ) : null}
    </main>
  );
}
