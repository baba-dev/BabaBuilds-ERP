"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import { Landmark, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FOREIGN_POS, GST_STATES, stateName } from "@/lib/gst/states";
import { useJson } from "./use-income-data";
import { formatMoney } from "./income-utils";

type GstView = {
  applicable: boolean; supplyType: string; placeOfSupply: string; interState: boolean; taxable: number; tax: number;
  split: { igst: number; cgst: number; sgst: number; cess: number }; issues: string[];
  overrides: { placeOfSupply: string | null; reverseCharge: boolean; supplyOverride: string | null; ecoGstin: string | null };
  einvoice: { status: string; dueBy: string | null; daysLeft: number | null; irn: string | null };
  eway: { needed: boolean; number: string | null };
  voided: boolean; canEdit: boolean;
};

/** GST view of an invoice inside the income drawer: how it is reported and a way to override place of supply, RCM or SEZ. */
export function InvoiceGstPanel({ invoiceId, locale }: { invoiceId: string; locale: string }) {
  const t = useTranslations("Income.gst");
  const { data, reload } = useJson<GstView>(`/api/gst/invoices/${invoiceId}`);
  const [editing, setEditing] = useState(false);
  if (!data || !data.applicable) return null;
  const m = (n: number) => formatMoney(n, "INR", locale);
  return (
    <section aria-labelledby="drawer-gst">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id="drawer-gst" className="flex items-center gap-2 text-sm font-semibold"><Landmark className="size-4 text-indigo-500" aria-hidden />{t("title")}</h3>
        {data.canEdit && !data.voided ? <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="me-1.5 size-3.5" aria-hidden />{t("edit")}</Button> : null}
      </div>
      <div className="space-y-2 rounded-xl border border-border/70 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{t(`type.${data.supplyType}`)}</span>
          <span className="text-xs text-muted-foreground">{stateName(data.placeOfSupply) || data.placeOfSupply} · {data.interState ? t("inter") : t("intra")}</span>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {(["igst", "cgst", "sgst", "cess"] as const).map((k) => <div key={k}><dt className="uppercase text-muted-foreground">{k}</dt><dd className="font-semibold tabular-nums">{m(data.split[k])}</dd></div>)}
        </dl>
        {data.einvoice.status !== "NOT_REQUIRED" ? <p className="text-xs text-muted-foreground">{t(`einv.${data.einvoice.status}`)}{data.einvoice.irn ? ` · ${data.einvoice.irn.slice(0, 10)}…` : ""}{data.einvoice.status === "PENDING" && data.einvoice.daysLeft !== null ? ` · ${t("daysLeft", { days: data.einvoice.daysLeft })}` : ""} · <Link href="/tax?tab=documents" className="text-indigo-600 hover:underline dark:text-indigo-300">{t("manage")}</Link></p> : null}
        {data.eway.needed ? <p className="text-xs text-amber-700 dark:text-amber-300">{t("eway")}</p> : null}
        {data.issues.length > 0 ? <ul className="space-y-0.5 text-xs text-amber-700 dark:text-amber-300">{data.issues.map((i) => <li key={i}>• {t(`issue.${i}`)}</li>)}</ul> : null}
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-md">{editing ? <EditForm invoiceId={invoiceId} data={data} onClose={() => setEditing(false)} onDone={reload} /> : null}</DialogContent>
      </Dialog>
    </section>
  );
}

function EditForm({ invoiceId, data, onClose, onDone }: { invoiceId: string; data: GstView; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("Income.gst");
  const [pos, setPos] = useState(data.overrides.placeOfSupply ?? "auto");
  const [rcm, setRcm] = useState(data.overrides.reverseCharge);
  const [sez, setSez] = useState(data.overrides.supplyOverride ?? "none");
  const [eco, setEco] = useState(data.overrides.ecoGstin ?? "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/gst/invoices/${invoiceId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placeOfSupply: pos === "auto" ? null : pos, reverseCharge: rcm, supplyOverride: sez === "none" ? null : sez, ecoGstin: eco.trim() || null }) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? t("failed"));
      toast.success(t("saved"));
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
      <DialogHeader><DialogTitle>{t("editTitle")}</DialogTitle><DialogDescription>{t("editBody")}</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5"><Label>{t("pos")}</Label>
          <Select value={pos} onValueChange={setPos}><SelectTrigger aria-label={t("pos")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">{t("posAuto")}</SelectItem>{[...GST_STATES, { code: FOREIGN_POS, name: t("outsideIndia") }].map((s) => <SelectItem key={s.code} value={s.code}>{s.code} · {s.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>{t("sez")}</Label>
          <Select value={sez} onValueChange={setSez}><SelectTrigger aria-label={t("sez")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t("sezNone")}</SelectItem><SelectItem value="SEZ_WP">{t("sezWp")}</SelectItem><SelectItem value="SEZ_WOP">{t("sezWop")}</SelectItem></SelectContent></Select></div>
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3"><div><p className="text-sm font-medium">{t("rcm")}</p><p className="text-xs text-muted-foreground">{t("rcmHint")}</p></div><Switch checked={rcm} onCheckedChange={setRcm} aria-label={t("rcm")} /></div>
        <div className="space-y-1.5"><Label htmlFor="eco">{t("eco")}</Label><Input id="eco" value={eco} maxLength={15} onChange={(e) => setEco(e.target.value.toUpperCase())} className="font-mono" /><p className="text-xs text-muted-foreground">{t("ecoHint")}</p></div>
      </div>
      <DialogFooter className="gap-2 sm:gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>{t("cancel")}</Button><Button onClick={save} disabled={busy}>{busy ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden /> : null}{t("save")}</Button></DialogFooter>
    </>
  );
}
