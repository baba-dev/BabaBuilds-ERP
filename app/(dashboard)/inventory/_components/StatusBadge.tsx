"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { StockStatus } from "./shared";

const TONE: Record<StockStatus, string> = {
  IN_STOCK: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  LOW_STOCK: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  OUT_OF_STOCK: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function StatusBadge({ status }: { status: StockStatus }) {
  const t = useTranslations("InventoryHub");
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", TONE[status])}><span className="h-1.5 w-1.5 rounded-full bg-current" />{t(`status.${status}`)}</span>;
}
