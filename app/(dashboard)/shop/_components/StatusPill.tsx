"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ShopStatus } from "./shared";

const TONE: Record<ShopStatus, string> = {
  PENDING: "bg-muted text-muted-foreground",
  PAID: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  SHIPPED: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  FULFILLED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  FAILED: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  REFUND_DUE: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  REFUNDED: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
};

export function StatusPill({ status }: { status: ShopStatus }) {
  const t = useTranslations("ShopHub");
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium", TONE[status])}>{t(`status.${status}`)}</span>;
}
