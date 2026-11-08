"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Repeat } from "lucide-react";
import { useFormat } from "@/hooks/use-format";
import { formatMoneyCompact } from "@/app/(dashboard)/income/_components/income-utils";
import type { ClientDto } from "@/lib/types/business";

/** Recurring billing at a glance for a client: retainers, MRR and unpaid retainer invoices, linked to /retainers. */
export function ClientRetainerChip({ client }: { client: ClientDto }) {
  const t = useTranslations("RetainersHub.clientChip");
  const { locale } = useFormat();
  const s = client.retainerSummary;
  if (!s || s.active + s.paused === 0) {
    return (
      <Link href={`/retainers/new?client=${client.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <Plus className="size-3.5" aria-hidden />{t("start")}
      </Link>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/retainers?clientId=${client.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/5 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-500/10 dark:text-indigo-300">
        <Repeat className="size-3.5" aria-hidden />
        {t("summary", { count: s.active, mrr: formatMoneyCompact(s.mrr, s.currency, locale) })}
        {s.paused > 0 ? <span className="font-normal opacity-70">· {t("paused", { count: s.paused })}</span> : null}
      </Link>
      {s.outstandingInvoices > 0 && (
        <Link href={`/income?source=RETAINER&clientId=${client.id}`} className={s.overdueInvoices > 0 ? "rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300" : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"}>
          {s.overdueInvoices > 0 ? t("overdue", { count: s.overdueInvoices }) : t("open", { count: s.outstandingInvoices })}
        </Link>
      )}
    </div>
  );
}
