"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ADJUSTMENT_KINDS } from "@/lib/gst/adjustment-kinds";
import { rule42Reversal } from "@/lib/gst/gaps";
import { callApi } from "./gst-utils";
import { EmptyArt } from "./art/GstArt";
import { periodLabel, readError, Section, Stat, TableShell, td, tdr, th, thr, useJson, useMoney } from "./gst-utils";

type Heads = { igst: number; cgst: number; sgst: number; cess: number; total: number };
type Ledger = {
  periods: Array<{ key: string; opening: Heads; added: Heads; reversed: Heads; used: Heads; closing: Heads; ineligible: number }>;
  bills: Array<{ id: string; date: string; vendor: string; gstin: string | null; invoiceNo: string | null; itcStatus: string; tax: number; hsn: string }>;
};
type Adjustments = { adjustments: Array<{ id: string; periodKey: string; kind: string; igst: number; cgst: number; sgst: number; cess: number; notes: string | null }> };

export function ItcTab({ fy, canManage }: { fy: string; canManage: boolean }) {
  const t = useTranslations("GstHub.itc");
  const { n, c, locale } = useMoney();
  const ledger = useJson<Ledger>(`/api/gst/itc?fy=${encodeURIComponent(fy)}`);
  const adj = useJson<Adjustments>("/api/gst/adjustments");
  const [adding, setAdding] = useState(false);
  const periods = ledger.data?.periods ?? [];
  const last = periods.filter((p) => p.added.total + p.used.total + p.opening.total > 0).at(-1) ?? periods.at(-1);
  const totalAdded = periods.reduce((s, p) => s + p.added.total, 0);
  const totalUsed = periods.reduce((s, p) => s + p.used.total, 0);
  const totalRev = periods.reduce((s, p) => s + p.reversed.total, 0);

  async function remove(id: string) {
    const res = await fetch(`/api/gst/adjustments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) return toast.error(await readError(res, t("failed")));
    toast.success(t("removed"));
    adj.reload();
    ledger.reload();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label={t("balance")} value={last ? c(last.closing.total) : "—"} sub={last ? `IGST ${c(last.closing.igst)} · CGST ${c(last.closing.cgst)} · SGST ${c(last.closing.sgst)}` : ""} accent="bg-emerald-500" />
        <Stat label={t("claimed")} value={c(totalAdded)} sub={t("claimedHint")} accent="bg-indigo-500" />
        <Stat label={t("used")} value={c(totalUsed)} sub={t("usedHint")} accent="bg-sky-500" />
        <Stat label={t("reversed")} value={c(totalRev)} sub={t("reversedHint")} accent="bg-rose-500" />
      </div>

      <Section title={t("ledger")} hint={t("ledgerHint")}>
        {ledger.loading && !ledger.data ? <Skeleton className="h-40 rounded-xl" /> : periods.every((p) => p.added.total + p.opening.total === 0) ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center"><EmptyArt variant="ledger" /><p className="text-sm font-medium">{t("emptyTitle")}</p><p className="max-w-sm text-xs text-muted-foreground">{t("emptyBody")}</p></div>
        ) : (
          <TableShell minWidth={760}>
            <thead><tr><th className={th}>{t("period")}</th><th className={thr}>{t("opening")}</th><th className={thr}>{t("added")}</th><th className={thr}>{t("reversedCol")}</th><th className={thr}>{t("usedCol")}</th><th className={thr}>{t("closing")}</th></tr></thead>
            <tbody>{periods.map((p) => <tr key={p.key} className="border-t border-border/50"><td className={td}>{periodLabel(p.key, locale)}</td><td className={tdr}>{n(p.opening.total)}</td><td className={tdr}>{n(p.added.total)}</td><td className={tdr}>{n(p.reversed.total)}</td><td className={tdr}>{n(p.used.total)}</td><td className={`${tdr} font-semibold`}>{n(p.closing.total)}</td></tr>)}</tbody>
          </TableShell>
        )}
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title={t("bills")} hint={t("billsHint")}>
          {(ledger.data?.bills.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">{t("noBills")}</p> : (
            <TableShell minWidth={520}>
              <thead><tr><th className={th}>{t("vendor")}</th><th className={th}>{t("status")}</th><th className={thr}>{t("gst")}</th></tr></thead>
              <tbody>{ledger.data!.bills.slice(0, 12).map((b) => <tr key={b.id} className="border-t border-border/50"><td className={td}><span className="block font-medium">{b.vendor}</span><span className="block text-xs text-muted-foreground">{b.date} · {b.invoiceNo ?? "—"}</span></td><td className={td}>{t(`bill.${b.itcStatus}`)}</td><td className={tdr}>{n(b.tax)}</td></tr>)}</tbody>
            </TableShell>
          )}
        </Section>

        <Section title={t("adjustments")} hint={t("adjustmentsHint")} right={canManage ? <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="me-1.5 size-4" aria-hidden />{t("add")}</Button> : null}>
          {(adj.data?.adjustments.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">{t("noAdjustments")}</p> : (
            <ul className="divide-y divide-border/50">
              {adj.data!.adjustments.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t(`kind.${a.kind}`)} · <span className="text-muted-foreground">{periodLabel(a.periodKey, locale)}</span></p>
                    <p className="text-xs tabular-nums text-muted-foreground">IGST {n(a.igst)} · CGST {n(a.cgst)} · SGST {n(a.sgst)}{a.notes ? ` · ${a.notes}` : ""}</p>
                  </div>
                  {canManage ? <Button size="icon" variant="ghost" aria-label={t("delete")} onClick={() => remove(a.id)}><Trash2 className="size-4" aria-hidden /></Button> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {canManage ? <Rule42Calculator onDone={() => { adj.reload(); ledger.reload(); }} /> : null}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-md">{adding ? <AdjustmentForm onClose={() => setAdding(false)} onDone={() => { adj.reload(); ledger.reload(); }} /> : null}</DialogContent>
      </Dialog>
    </div>
  );
}

function AdjustmentForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations("GstHub.itc");
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [kind, setKind] = useState<string>("ITC_OPENING");
  const [v, setV] = useState({ igst: "", cgst: "", sgst: "", cess: "" });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/gst/adjustments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodKey: period, kind, igst: Number(v.igst) || 0, cgst: Number(v.cgst) || 0, sgst: Number(v.sgst) || 0, cess: Number(v.cess) || 0, notes: notes.trim() || null }),
      });
      if (!res.ok) throw new Error(await readError(res, t("failed")));
      toast.success(t("added2"));
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("addTitle")}</DialogTitle>
        <DialogDescription>{t("addBody")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("type")}</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ADJUSTMENT_KINDS.map((k) => <SelectItem key={k} value={k}>{t(`kind.${k}`)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adjMonth">{t("month")}</Label>
          <Input id="adjMonth" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(["igst", "cgst", "sgst", "cess"] as const).map((k) => (
            <div key={k} className="space-y-1.5"><Label htmlFor={`adj-${k}`} className="uppercase">{k}</Label><Input id={`adj-${k}`} inputMode="decimal" value={v[k]} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} placeholder="0" /></div>
          ))}
        </div>
        <div className="space-y-1.5"><Label htmlFor="adjNotes">{t("notes")}</Label><Input id="adjNotes" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
        <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden /> : null}{t("save")}</Button>
      </DialogFooter>
    </>
  );
}

/** Rule 42: reverse the share of common credit that relates to exempt supplies. Shows the working, then records it. */
function Rule42Calculator({ onDone }: { onDone: () => void }) {
  const t = useTranslations("GstHub.itc.rule42");
  const { n } = useMoney();
  const now = new Date();
  const [v, setV] = useState({ igst: "", cgst: "", sgst: "", exempt: "", total: "", month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` });
  const [busy, setBusy] = useState(false);
  const ex = Number(v.exempt) || 0;
  const tot = Number(v.total) || 0;
  const rev = { igst: rule42Reversal({ commonCredit: Number(v.igst) || 0, exemptTurnover: ex, totalTurnover: tot }), cgst: rule42Reversal({ commonCredit: Number(v.cgst) || 0, exemptTurnover: ex, totalTurnover: tot }), sgst: rule42Reversal({ commonCredit: Number(v.sgst) || 0, exemptTurnover: ex, totalTurnover: tot }) };
  const sum = rev.igst + rev.cgst + rev.sgst;
  async function record() {
    setBusy(true);
    const r = await callApi("POST", "/api/gst/adjustments", { periodKey: v.month, kind: "ITC_REVERSAL_RULE_42", ...rev, cess: 0, notes: t("note", { exempt: String(ex), total: String(tot) }) });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(t("recorded"));
    onDone();
  }
  const set = (k: keyof typeof v, x: string) => setV((p) => ({ ...p, [k]: x }));
  return (
    <Section title={t("title")} hint={t("hint")}>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(["igst", "cgst", "sgst"] as const).map((k) => <div key={k} className="space-y-1.5"><Label htmlFor={`r42-${k}`}>{t("common", { head: k.toUpperCase() })}</Label><Input id={`r42-${k}`} inputMode="decimal" value={v[k]} onChange={(e) => set(k, e.target.value)} placeholder="0" /></div>)}
        <div className="space-y-1.5"><Label htmlFor="r42-ex">{t("exempt")}</Label><Input id="r42-ex" inputMode="decimal" value={v.exempt} onChange={(e) => set("exempt", e.target.value)} placeholder="0" /></div>
        <div className="space-y-1.5"><Label htmlFor="r42-tot">{t("total")}</Label><Input id="r42-tot" inputMode="decimal" value={v.total} onChange={(e) => set("total", e.target.value)} placeholder="0" /></div>
        <div className="space-y-1.5"><Label htmlFor="r42-m">{t("month")}</Label><Input id="r42-m" type="month" value={v.month} onChange={(e) => set("month", e.target.value)} /></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <p className="text-sm">{t("result", { amount: n(sum) })}<span className="ms-2 text-xs text-muted-foreground">IGST {n(rev.igst)} · CGST {n(rev.cgst)} · SGST {n(rev.sgst)}</span></p>
        <Button size="sm" onClick={record} disabled={busy || sum <= 0}>{busy ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden /> : null}{t("record")}</Button>
      </div>
    </Section>
  );
}
