"use client";

import { useLocale } from "next-intl";
import { dirFromLocale } from "@/src/lib/direction";

export function useDirection() {
  const locale = useLocale();
  const dir = dirFromLocale(locale);
  return { locale, dir, isRtl: dir === "rtl" };
}
