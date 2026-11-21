"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { normalizeTdsSection } from "@/lib/invoice/tds";

export type TdsState = { on: boolean; section: string; rate: string };

/**
 * "The client deducts TDS" control for the invoice composer. Prefilled from the client's default by the caller; shows
 * the estimated net payable (the server computes the exact amount on the pre-GST subtotal).
 */
export function TdsField({
  value,
  onChange,
  disabled,
  subtotal,
  total,
  format,
  prefilled,
}: {
  value: TdsState;
  onChange: (next: TdsState) => void;
  /** True for export invoices: TDS does not apply, so the control is switched off and locked. */
  disabled?: boolean;
  subtotal: number;
  total: number;
  format: (n: number) => string;
  prefilled?: boolean;
}) {
  const t = useTranslations("InvoiceTds");
  const id = useId();
  const rate = value.rate.trim() === "" ? null : Number(value.rate);
  const rateInvalid = value.on && rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100);
  const sectionInvalid = value.on && value.section.trim() !== "" && normalizeTdsSection(value.section) === null;
  const active = value.on && !disabled && rate !== null && Number.isFinite(rate) && rate > 0 && rate <= 100;
  const tds = active ? Math.round(((subtotal * (rate as number)) / 100 + Number.EPSILON) * 100) / 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor={`${id}-switch`} className="text-sm font-medium">{t("title")}</label>
          <p className="mt-0.5 text-xs text-muted-foreground">{disabled ? t("exportOff") : t("hint")}</p>
        </div>
        <Switch id={`${id}-switch`} checked={value.on && !disabled} disabled={disabled} onCheckedChange={(on) => onChange({ ...value, on })} className="mt-0.5 shrink-0" />
      </div>

      {value.on && !disabled ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${id}-section`} className="text-xs font-medium text-muted-foreground">{t("section")}</label>
              <Input id={`${id}-section`} value={value.section} maxLength={12} placeholder="194J" autoCapitalize="characters" spellCheck={false} aria-invalid={sectionInvalid} onChange={(e) => onChange({ ...value, section: e.target.value.toUpperCase() })} className="h-10 font-mono pointer-coarse:h-11" />
              {sectionInvalid ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{t("invalidSection")}</p> : null}
            </div>
            <div className="space-y-1">
              <label htmlFor={`${id}-rate`} className="text-xs font-medium text-muted-foreground">{t("rate")}</label>
              <Input id={`${id}-rate`} value={value.rate} inputMode="decimal" maxLength={6} placeholder="10" aria-invalid={rateInvalid} onChange={(e) => onChange({ ...value, rate: e.target.value.replace(/[^\d.]/g, "") })} className="h-10 pointer-coarse:h-11" />
              {rateInvalid ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{t("invalidRate")}</p> : null}
            </div>
          </div>
          {prefilled ? <p className="text-xs text-muted-foreground">{t("fromClient")}</p> : null}
          {active ? (
            <dl className={cn("rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm")}>
              <div className="flex items-center justify-between gap-3 text-muted-foreground"><dt>{t("tdsLine", { rate: String(rate) })}</dt><dd className="tabular-nums">-{format(tds)}</dd></div>
              <div className="mt-1 flex items-center justify-between gap-3 font-semibold"><dt>{t("net")}</dt><dd className="tabular-nums">{format(Math.max(0, total - tds))}</dd></div>
              <p className="mt-1.5 text-xs font-normal text-muted-foreground">{t("estimate")}</p>
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
