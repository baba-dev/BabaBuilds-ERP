"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Keeps a failure inside CA Compliance from blanking the app. */
export default function CaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("CaCompliance.error");
  useEffect(() => {
    console.error("CA compliance error:", error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300"><AlertTriangle className="size-6" aria-hidden /></span>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("body")}</p>
      {error.digest ? <p className="font-mono text-xs text-muted-foreground">{t("reference", { id: error.digest })}</p> : null}
      <Button onClick={reset}>{t("retry")}</Button>
    </div>
  );
}
