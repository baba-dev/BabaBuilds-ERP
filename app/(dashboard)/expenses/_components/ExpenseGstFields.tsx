"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, ReceiptText, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { computeExpenseGst, GST_RATE_OPTIONS, vendorStateOf, type ItcStatus } from "@/lib/gst/expense-gst";
import { normalizeGstin, validateGstin } from "@/lib/gst/gstin";
import { stateName } from "@/lib/gst/states";

export type ExpenseGstState = {
  itcStatus: ItcStatus;
  vendorGstin: string;
  vendorInvoiceNo: string;
  hsnCode: string;
  gstRate: string;
  paymentStatus: "PAID" | "UNPAID";
};

export const EMPTY_EXPENSE_GST: ExpenseGstState = { itcStatus: "NONE", vendorGstin: "", vendorInvoiceNo: "", hsnCode: "", gstRate: "18", paymentStatus: "PAID" };

export function gstStateFromExpense(e: { paymentStatus?: string; itcStatus?: string; vendorGstin?: string | null; vendorInvoiceNo?: string | null; hsnCode?: string | null; gstRate?: number | null }): ExpenseGstState {
  return {
    itcStatus: (["ELIGIBLE", "INELIGIBLE", "REVERSE_CHARGE"].includes(e.itcStatus ?? "") ? e.itcStatus : "NONE") as ItcStatus,
    vendorGstin: e.vendorGstin ?? "",
    vendorInvoiceNo: e.vendorInvoiceNo ?? "",
    hsnCode: e.hsnCode ?? "",
    gstRate: e.gstRate === null || e.gstRate === undefined ? "18" : String(e.gstRate),
    paymentStatus: e.paymentStatus === "UNPAID" ? "UNPAID" : "PAID",
  };
}

/** Body fragment for the API (JSON). Tax amounts are computed server-side. */
export function gstPayload(s: ExpenseGstState) {
  return {
    itcStatus: s.itcStatus,
    vendorGstin: normalizeGstin(s.vendorGstin) || null,
    vendorInvoiceNo: s.vendorInvoiceNo.trim() || null,
    hsnCode: s.hsnCode.trim() || null,
    gstRate: s.itcStatus === "NONE" ? null : Number(s.gstRate),
    paymentStatus: s.paymentStatus,
  };
}

const OPTIONS: ItcStatus[] = ["NONE", "ELIGIBLE", "INELIGIBLE", "REVERSE_CHARGE"];

/** "GST on this bill": credit status, vendor GSTIN, rate and a live CGST/SGST/IGST split. India workspaces only. */
export function ExpenseGstFields({ value, onChange, amount, supplierState }: { value: ExpenseGstState; onChange: (next: ExpenseGstState) => void; amount: number; supplierState: string | null }) {
  const t = useTranslations("Expenses.gst");
  const locale = useLocale();
  const [userOpen, setUserOpen] = useState(false);
  const open = userOpen || value.itcStatus !== "NONE";
  const set = (patch: Partial<ExpenseGstState>) => onChange({ ...value, ...patch });
  const gstin = normalizeGstin(value.vendorGstin);
  const check = gstin.length === 15 ? validateGstin(gstin) : null;
  const calc = computeExpenseGst({ amount, rate: Number(value.gstRate), itcStatus: value.itcStatus, supplierState, vendorState: vendorStateOf(gstin, null) });
  const money = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "INR" }).format(n);

  return (
    <div className="rounded-xl border border-border/70 bg-muted/20">
      <button type="button" onClick={() => setUserOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><ReceiptText className="size-4" aria-hidden /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t("title")}</span><span className="block text-xs text-muted-foreground">{value.itcStatus === "NONE" ? t("collapsed") : t(`status.${value.itcStatus}`)}</span></span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-border/60 p-3.5">
          <div role="radiogroup" aria-label={t("credit")} className="grid grid-cols-2 gap-2">
            {OPTIONS.map((o) => (
              <button key={o} type="button" role="radio" aria-checked={value.itcStatus === o} onClick={() => set({ itcStatus: o })}
                className={cn("rounded-lg border px-3 py-2 text-start text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", value.itcStatus === o ? "border-indigo-500 bg-indigo-50/70 font-semibold text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-200" : "border-border/70 hover:border-indigo-300")}>
                {t(`option.${o}`)}
              </button>
            ))}
          </div>
          {value.itcStatus !== "NONE" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="exp-gstin">{t("vendorGstin")}</Label>
                  <div className="relative">
                    <Input id="exp-gstin" value={value.vendorGstin} maxLength={15} spellCheck={false} onChange={(e) => set({ vendorGstin: e.target.value.toUpperCase() })} placeholder="29AABCT1332L1ZB" className="pe-9 font-mono tracking-wide" aria-invalid={check ? !check.valid : undefined} />
                    {check ? (check.valid ? <CheckCircle2 className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-emerald-500" aria-hidden /> : <XCircle className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-rose-500" aria-hidden />) : null}
                  </div>
                  <p className={cn("text-xs", check && !check.valid ? "text-rose-600" : "text-muted-foreground")}>{check && !check.valid ? t("gstinInvalid") : check && check.valid ? t("gstinState", { state: stateName(check.stateCode) }) : t("gstinHint")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exp-invno">{t("invoiceNo")}</Label>
                  <Input id="exp-invno" value={value.vendorInvoiceNo} maxLength={60} onChange={(e) => set({ vendorInvoiceNo: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exp-hsn">{t("hsn")}</Label>
                  <Input id="exp-hsn" inputMode="numeric" value={value.hsnCode} maxLength={8} onChange={(e) => set({ hsnCode: e.target.value.replace(/\D/g, "") })} placeholder="998314" className="font-mono" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("rate")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {GST_RATE_OPTIONS.map((r) => (
                    <button key={r} type="button" aria-pressed={value.gstRate === String(r)} onClick={() => set({ gstRate: String(r) })}
                      className={cn("rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", value.gstRate === String(r) ? "border-indigo-500 bg-indigo-600 text-white" : "border-border/70 hover:border-indigo-300")}>
                      {r}%
                    </button>
                  ))}
                </div>
              </div>
              {value.itcStatus === "ELIGIBLE" ? (
                <div className="space-y-1.5">
                  <Label>{t("payment")}</Label>
                  <div role="radiogroup" aria-label={t("payment")} className="grid grid-cols-2 gap-2">
                    {(["PAID", "UNPAID"] as const).map((p) => (
                      <button key={p} type="button" role="radio" aria-checked={value.paymentStatus === p} onClick={() => set({ paymentStatus: p })}
                        className={cn("rounded-lg border px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", value.paymentStatus === p ? "border-indigo-500 bg-indigo-50/70 font-semibold text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-200" : "border-border/70 hover:border-indigo-300")}>
                        {t(p === "PAID" ? "paid" : "unpaid")}
                      </button>
                    ))}
                  </div>
                  {value.paymentStatus === "UNPAID" ? <p className="text-xs text-amber-700 dark:text-amber-300">{t("unpaidHint")}</p> : null}
                </div>
              ) : null}
              {amount > 0 ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-background/70 p-3 text-xs sm:grid-cols-4">
                  <div><dt className="text-muted-foreground">{value.itcStatus === "REVERSE_CHARGE" ? t("value") : t("taxable")}</dt><dd className="font-semibold tabular-nums">{money(calc.taxable)}</dd></div>
                  {calc.interState ? <div><dt className="text-muted-foreground">IGST</dt><dd className="font-semibold tabular-nums">{money(calc.igst)}</dd></div> : <><div><dt className="text-muted-foreground">CGST</dt><dd className="font-semibold tabular-nums">{money(calc.cgst)}</dd></div><div><dt className="text-muted-foreground">SGST</dt><dd className="font-semibold tabular-nums">{money(calc.sgst)}</dd></div></>}
                  <div><dt className="text-muted-foreground">{t("totalLabel")}</dt><dd className="font-semibold tabular-nums">{money(calc.total)}</dd></div>
                </dl>
              ) : null}
              <p className="text-xs text-muted-foreground">{value.itcStatus === "REVERSE_CHARGE" ? t("rcmHint") : value.itcStatus === "INELIGIBLE" ? t("blockedHint") : t("amountHint")}</p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
