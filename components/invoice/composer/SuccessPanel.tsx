"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { AlertCircle, Download, FileText, Mail, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBustedUrl } from "@/lib/cache-buster";

type Props = {
  invoiceNumber: string;
  pdfPath: string;
  emailStatus?: string;
  paymentLinkStatus?: { attempted: boolean; created: boolean; skipReason: string | null };
  onAnother: () => void;
};

export function SuccessPanel({ invoiceNumber, pdfPath, emailStatus, paymentLinkStatus, onAnother }: Props) {
  const t = useTranslations("InvoiceComposer.success");
  const reduce = useReducedMotion();
  const emailRequested = emailStatus && emailStatus !== "Not requested";
  const emailOk = emailStatus === "Success";

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
      className="mx-auto max-w-xl space-y-5 rounded-3xl border border-emerald-500/30 bg-card p-6 text-center shadow-lg sm:p-8"
      role="status"
      aria-live="polite"
    >
      <svg viewBox="0 0 52 52" className="mx-auto size-20" aria-hidden>
        <motion.circle cx="26" cy="26" r="24" fill="none" strokeWidth="3" className="stroke-emerald-500" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: "easeOut" }} />
        <motion.path d="M15 27l8 8 14-16" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-emerald-500" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.45, ease: "easeOut" }} />
      </svg>

      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
        <p className="mt-1 text-muted-foreground">{t("subtitle", { number: invoiceNumber })}</p>
      </div>

      <div className="space-y-2 text-start text-sm">
        {emailRequested && (
          <p className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${emailOk ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}>
            <Mail className="size-4 shrink-0" aria-hidden />
            {emailOk ? t("emailSent") : t("emailFailed", { status: emailStatus ?? "" })}
          </p>
        )}
        {paymentLinkStatus && !paymentLinkStatus.created && (
          <p className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {t("noPaymentLink")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button asChild variant="primary-action" size="lg" className="gap-2 rounded-xl">
          <a href={getBustedUrl(pdfPath)} target="_blank" rel="noopener noreferrer">
            <Download className="size-4" aria-hidden /> {t("download")}
          </a>
        </Button>
        <Button asChild variant="outline" size="lg" className="gap-2 rounded-xl">
          <Link href={`/income?q=${encodeURIComponent(invoiceNumber)}`}>
            <FileText className="size-4" aria-hidden /> {t("viewInvoices")}
          </Link>
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onAnother} className="gap-2 rounded-xl">
          <Plus className="size-4" aria-hidden /> {t("another")}
        </Button>
      </div>
    </motion.div>
  );
}
