"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { InvoiceDisplayStatus } from "@/lib/invoices/types";
import { STATUS_STYLES } from "./income-utils";

export function StatusBadge({ status, className }: { status: InvoiceDisplayStatus; className?: string }) {
  const t = useTranslations("Income.status");
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        style.chip,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
      {t(status)}
    </span>
  );
}
