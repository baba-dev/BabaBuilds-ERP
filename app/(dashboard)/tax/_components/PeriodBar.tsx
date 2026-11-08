"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatDay, periodLabel, StatusChip, useMoney, type GstAccessFlags, type ObligationView } from "./gst-utils";
import { ReviewButton } from "./ReviewPanel";

/** Period picker + status + primary actions shared by the GSTR-1 and GSTR-3B views. */
export function PeriodBar({ obligations, value, onChange, onFile, access, onChanged, children }: { obligations: ObligationView[]; value: string; onChange: (key: string) => void; onFile: (o: ObligationView) => void; access: GstAccessFlags; onChanged: () => void; children?: React.ReactNode }) {
  const t = useTranslations("GstHub");
  const { locale } = useMoney();
  const current = obligations.find((o) => o.periodKey === value) ?? null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[190px]" aria-label={t("period")}><SelectValue /></SelectTrigger>
        <SelectContent>
          {obligations.map((o) => (
            <SelectItem key={o.periodKey} value={o.periodKey}>{periodLabel(o.periodKey, locale)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current ? (
        <>
          <StatusChip status={current.status} label={t(`status.${current.status}`)} />
          <span className="text-xs text-muted-foreground">{t("dueOn", { date: formatDay(current.extendedDueDate ?? current.dueDate, locale) })}</span>
        </>
      ) : null}
      <div className="ms-auto flex flex-wrap items-center gap-2">
        {children}
        {current ? <ReviewButton obligation={current} access={access} onChanged={onChanged} /> : null}
        {current && current.status !== "OPEN_PERIOD" && access.file ? (
          <Button size="sm" variant={current.status === "FILED" ? "outline" : "default"} onClick={() => onFile(current)}>{current.status === "FILED" ? t("edit") : t("markFiled")}</Button>
        ) : null}
      </div>
    </div>
  );
}
