"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Mail, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ReconRow, ReconStatus } from "@/lib/gst/recon";
import { EmptyArt } from "./art/GstArt";
import { callApi, periodLabel, readError, Section, Stat, TableShell, td, tdr, th, thr, useJson, useMoney } from "./gst-utils";

type Resp = { uploaded: number; rows: ReconRow[]; counts: Record<ReconStatus, number>; unmatchedTax: number };

const CHIP: Record<ReconStatus, string> = {
  MATCHED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  LIKELY: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300",
  MISMATCH: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300",
  MISSING_IN_2B: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300",
  MISSING_IN_BOOKS: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300",
};

export function ReconTab({ months, initial, canManage }: { months: string[]; initial?: string; canManage: boolean }) {
  const t = useTranslations("GstHub.recon");
  const { n, c, locale } = useMoney();
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const [period, setPeriod] = useState(initial && months.includes(initial) ? initial : months.includes(prevKey) ? prevKey : months.includes(currentKey) ? currentKey : months[months.length - 1]);
  const [filter, setFilter] = useState<ReconStatus | "ALL">("ALL");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [tolerance, setTolerance] = useState("1");
  const { data, loading, error, reload } = useJson<Resp>(`/api/gst/recon?period=${encodeURIComponent(period)}&tolerance=${encodeURIComponent(tolerance)}`);

  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("period", period);
      const res = await fetch("/api/gst/recon", { method: "POST", body: form });
      if (!res.ok) throw new Error(await readError(res, t("failed")));
      const body = await res.json();
      toast.success(t("imported", { count: body.imported }));
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function clear() {
    const res = await fetch(`/api/gst/recon?period=${encodeURIComponent(period)}`, { method: "DELETE" });
    if (!res.ok) return toast.error(await readError(res, t("failed")));
    toast.success(t("cleared"));
    reload();
  }

  async function patchBill(id: string, body: Record<string, unknown>, done: string) {
    const r = await callApi("PATCH", `/api/gst/bills/${id}`, body);
    if (!r.ok) return void toast.error(r.error);
    toast.success(done);
    reload();
  }
  const nextMonth = (() => { const [y, mo] = period.split("-").map(Number); return `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, "0")}`; })();
  const rows = (data?.rows ?? []).filter((r) => filter === "ALL" || r.status === filter);
  const counts = data?.counts;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[170px]" aria-label={t("month")}><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m) => <SelectItem key={m} value={m}>{periodLabel(m, locale)}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{data ? t("uploaded", { count: data.uploaded }) : ""}</p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">{t("tolerance")}
          <Select value={tolerance} onValueChange={setTolerance}><SelectTrigger className="h-8 w-[84px]" aria-label={t("tolerance")}><SelectValue /></SelectTrigger><SelectContent>{["1", "5", "10", "50"].map((x) => <SelectItem key={x} value={x}>₹{x}</SelectItem>)}</SelectContent></Select>
        </label>
        <div className="ms-auto flex gap-2">
          {data && data.uploaded > 0 ? <Button size="sm" variant="ghost" onClick={clear}><Trash2 className="me-1.5 size-4" aria-hidden />{t("clear")}</Button> : null}
          <input ref={input} type="file" accept=".json,.csv,application/json,text/csv" className="sr-only" aria-label={t("upload")} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          <Button size="sm" onClick={() => input.current?.click()} disabled={busy}>{busy ? <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden /> : <Upload className="me-1.5 size-4" aria-hidden />}{t("upload")}</Button>
        </div>
      </div>
      <p className="rounded-xl bg-sky-50/70 px-4 py-2.5 text-xs text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">{t("intro")}</p>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}
      {loading && !data ? <Skeleton className="h-48 rounded-2xl" /> : null}
      {data && data.uploaded === 0 && (data.rows.length === 0) ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-10 text-center"><EmptyArt variant="match" /><p className="text-sm font-medium">{t("emptyTitle")}</p><p className="max-w-sm text-xs text-muted-foreground">{t("emptyBody")}</p></div>
      ) : null}
      {data && data.rows.length > 0 && counts ? (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
            <Stat label={t("matched")} value={counts.MATCHED} accent="bg-emerald-500" />
            <Stat label={t("likely")} value={counts.LIKELY} sub={t("likelyHint")} accent="bg-violet-500" />
            <Stat label={t("mismatch")} value={counts.MISMATCH} accent="bg-amber-500" />
            <Stat label={t("missing2b")} value={counts.MISSING_IN_2B} sub={t("missing2bHint")} accent="bg-rose-500" />
            <Stat label={t("missingBooks")} value={counts.MISSING_IN_BOOKS} sub={t("atRisk", { amount: c(data.unmatchedTax) })} accent="bg-sky-500" />
          </div>
          <Section title={t("results")} right={
            <Select value={filter} onValueChange={(v) => setFilter(v as ReconStatus | "ALL")}>
              <SelectTrigger className="h-8 w-[170px]" aria-label={t("filter")}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ALL">{t("all")}</SelectItem>{(Object.keys(CHIP) as ReconStatus[]).map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}</SelectContent>
            </Select>
          }>
            <TableShell minWidth={canManage ? 1040 : 820}>
              <thead><tr><th className={th}>{t("supplier")}</th><th className={th}>{t("invoice")}</th><th className={th}>{t("statusCol")}</th><th className={thr}>{t("in2b")}</th><th className={thr}>{t("inBooks")}</th><th className={thr}>{t("diff")}</th>{canManage ? <th className={thr}>{t("actions")}</th> : null}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.supplierGstin}-${r.invoiceNumber}-${r.status}`} className="border-t border-border/50">
                    <td className={td}><span className="block font-medium">{r.supplierName || "—"}</span><span className="block font-mono text-[11px] text-muted-foreground">{r.supplierGstin}</span></td>
                    <td className={td}>{r.invoiceNumber}<span className="block text-xs text-muted-foreground">{r.date ?? ""}{r.bookInvoiceNumber ? ` · ${t("bookNo", { number: r.bookInvoiceNumber })}` : ""}{r.held ? ` · ${t("held")}` : ""}</span></td>
                    <td className={td}><span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", CHIP[r.status])}>{t(`status.${r.status}`)}</span></td>
                    <td className={tdr}>{r.twoB ? n(r.twoB.tax) : "—"}</td>
                    <td className={tdr}>{r.books ? n(r.books.tax) : "—"}</td>
                    <td className={cn(tdr, Math.abs(r.taxDifference) > 1 && "font-semibold text-rose-600 dark:text-rose-400")}>{n(r.taxDifference)}</td>
                    {canManage ? (
                      <td className={cn(td, "text-end")}>
                        <div className="flex flex-wrap justify-end gap-1">
                          {(r.status === "LIKELY" || r.status === "MISMATCH") && r.books && r.twoB ? <Button size="sm" variant="outline" onClick={() => patchBill(r.books!.expenseId, { acceptTwoB: { igst: r.twoB!.igst, cgst: r.twoB!.cgst, sgst: r.twoB!.sgst, cess: r.twoB!.cess, invoiceNumber: r.status === "LIKELY" ? r.invoiceNumber : undefined } }, t("accepted"))}>{r.status === "LIKELY" ? t("confirm") : t("accept2b")}</Button> : null}
                          {r.status === "MISSING_IN_2B" && r.books ? (
                            <>
                              {r.held ? <Button size="sm" variant="outline" onClick={() => patchBill(r.books!.expenseId, { itcHeld: false }, t("released"))}>{t("release")}</Button> : <Button size="sm" variant="outline" onClick={() => patchBill(r.books!.expenseId, { itcHeld: true }, t("holdDone"))}>{t("hold")}</Button>}
                              <Button size="sm" variant="ghost" onClick={() => patchBill(r.books!.expenseId, { itcHeld: false, itcClaimMonth: nextMonth }, t("deferred", { month: periodLabel(nextMonth, locale) }))}>{t("nextMonth")}</Button>
                              <Button size="sm" variant="ghost" asChild><a href={`mailto:?subject=${encodeURIComponent(t("mailSubject", { number: r.invoiceNumber }))}&body=${encodeURIComponent(t("mailBody", { number: r.invoiceNumber, gstin: r.supplierGstin, amount: n(r.books.tax), month: periodLabel(period, locale) }))}`}><Mail className="size-4" aria-hidden /><span className="sr-only">{t("chase")}</span></a></Button>
                            </>
                          ) : null}
                          {r.status === "MISSING_IN_BOOKS" ? <Button size="sm" variant="ghost" asChild><a href="/expenses">{t("addBill")}</a></Button> : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </Section>
        </div>
      ) : null}
    </div>
  );
}
