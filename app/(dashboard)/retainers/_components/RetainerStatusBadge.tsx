"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { RetainerDisplayStatus } from "@/lib/retainers/status";
import { STATUS_STYLES } from "./retainer-utils";

export function RetainerStatusBadge({ status, className }: { status: RetainerDisplayStatus; className?: string }) {
  const t = useTranslations("RetainersHub");
  const style = STATUS_STYLES[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", style.chip, className)}>
      <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
      {t(`status.${status}`)}
    </span>
  );
}
