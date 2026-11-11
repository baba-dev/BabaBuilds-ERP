"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, FileJson, Loader2, Plus, QrCode, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { GST_STATES } from "@/lib/gst/states";
import { EmptyArt } from "./art/GstArt";
import { callApi, formatDay, Section, Stat, TableShell, td, tdr, th, thr, useJson, useMoney, type ObligationView } from "./gst-utils";
import type { EInvoiceRow } from "@/lib/gst/insights";

type Sub = "einvoice" | "notes" | "amendments" | "advances";
const RATES = [0, 5, 18, 40, 12, 28];

export function DocumentsTab({ fy, canManage, obligations }: { fy: string; canManage: boolean; obligations: ObligationView[] }) {
  const t = useTranslations("GstHub.docs");
  const [sub, setSub] = useState<Sub>("einvoice");
  return (
    <div className="space-y-5">
      <div role="tablist" aria-label={t("title")} className="flex flex-wrap gap-1.5">
        {(["einvoice", "notes", "amendments", "advances"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={sub === k} type="button" onClick={() => setSub(k)}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", sub === k ? "border-indigo-500 bg-indigo-600 text-white" : "border-border/70 text-muted-foreground hover:border-indigo-300 hover:text-foreground")}>
            {t(`sub.${k}`)}
          </button>
        ))}
      </div>
      {sub === "einvoice" ? <EInvoicePanel fy={fy} canManage={canManage} /> : null}
      {sub === "notes" ? <NotesPanel kind="debit-notes" canManage={canManage} obligations={obligations} /> : null}
      {sub === "amendments" ? <NotesPanel kind="amendments" canManage={canManage} obligations={obligations} /> : null}
      {sub === "advances" ? <NotesPanel kind="advances" canManage={canManage} obligations={obligations} /> : null}
    </div>
  );
}

type Register = { required: boolean; prevTurnover: number; rows: EInvoiceRow[]; pending: number; overdue: number };

function EInvoicePanel({ fy, canManage }: { fy: string; canManage: boolean }) {
  const t = useTranslations("GstHub.docs.einv");
  const { m, n, locale } = useMoney();
  const { data, loading, error, reload } = useJson<Register>(`/api/gst/einvoice?fy=${encodeURIComponent(fy)}`);
  const [irnFor, setIrnFor] = useState<EInvoiceRow | null>(null);
  const [ewayOpen, setEwayOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const rows = data?.rows ?? [];
  const ewayRows = rows.filter((r) => r.ewayNeeded);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label={t("applies")} value={data?.required ? t("yes") : t("no")} sub={data?.required ? t("appliesYes") : t("appliesNo", { limit: "₹5 crore" })} accent="bg-indigo-500" />
        <Stat label={t("pending")} value={data?.pending ?? 0} sub={t("pendingHint")} accent="bg-amber-500" />
        <Stat label={t("overdue")} value={data?.overdue ?? 0} sub={t("overdueHint")} accent="bg-rose-500" />
        <Stat label={t("eway")} value={ewayRows.length} sub={t("ewayHint")} accent="bg-sky-500" />
      </div>
      <p className="rounded-xl bg-indigo-50/70 px-4 py-2.5 text-xs text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-200">{t("intro")}</p>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}
      {loading && !data ? <Skeleton className="h-48 rounded-2xl" /> : null}
      {data && rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-10 text-center"><EmptyArt variant="returns" /><p className="text-sm font-medium">{t("emptyTitle")}</p><p className="max-w-sm text-xs text-muted-foreground">{data.required ? t("emptyBody") : t("notRequired")}</p></div>
      ) : null}
      {rows.length > 0 ? (
        <Section title={t("register")} hint={t("registerHint")} right={ewayRows.length > 0 && canManage ? <Button size="sm" variant="outline" disabled={selected.length === 0} onClick={() => setEwayOpen(true)}><Truck className="me-1.5 size-4" aria-hidden />{t("ewayCta", { count: selected.length })}</Button> : null}>
          <TableShell minWidth={860}>
            <thead><tr><th className={th} /><th className={th}>{t("invoice")}</th><th className={th}>{t("customer")}</th><th className={thr}>{t("value")}</th><th className={th}>{t("statusCol")}</th><th className={th}>{t("irn")}</th><th className={thr} /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/50">
                  <td className={td}>{r.ewayNeeded ? <input type="checkbox" aria-label={t("selectEway", { number: r.number })} checked={selected.includes(r.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))} className="size-4 accent-indigo-600" /> : null}</td>
                  <td className={cn(td, "font-medium")}>{r.number}<span className="block text-xs font-normal text-muted-foreground">{r.date}{r.ewayNeeded ? ` · ${t("ewayNeeded")}` : ""}</span></td>
                  <td className={td}>{r.party}<span className="block font-mono text-[11px] text-muted-foreground">{r.gstin ?? ""}</span></td>
                  <td className={tdr}>{n(r.value)}</td>
                  <td className={td}>
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", r.status === "REPORTED" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : r.status === "OVERDUE" ? "bg-rose-50 text-rose-700 ring-rose-600/20" : r.status === "PENDING" ? "bg-amber-50 text-amber-800 ring-amber-600/20" : "bg-zinc-100 text-zinc-600 ring-zinc-500/20")}>{t(`status.${r.status}`)}</span>
                    {r.dueBy && r.status !== "REPORTED" ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{(r.daysLeft ?? 0) < 0 ? t("lateBy", { date: formatDay(r.dueBy, locale) }) : t("dueBy", { date: formatDay(r.dueBy, locale), days: r.daysLeft ?? 0 })}</span> : null}
                  </td>
                  <td className={cn(td, "max-w-[160px] truncate font-mono text-[11px]")} title={r.irn ?? ""}>{r.irn ? `${r.irn.slice(0, 12)}…` : "—"}</td>
                  <td className={cn(tdr, "whitespace-nowrap")}>
                    {r.status !== "NOT_REQUIRED" ? <Button size="sm" variant="ghost" asChild><a href={`/api/gst/invoices/${r.id}/einvoice`} aria-label={t("downloadJson", { number: r.number })}><FileJson className="size-4" aria-hidden /></a></Button> : null}
                    {canManage && r.status !== "NOT_REQUIRED" ? <Button size="sm" variant="ghost" onClick={() => setIrnFor(r)} aria-label={t("recordIrn", { number: r.number })}><QrCode className="size-4" aria-hidden /></Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Section>
      ) : null}
      <span className="sr-only">{m(0)}</span>
      <Dialog open={!!irnFor} onOpenChange={(o) => (!o ? setIrnFor(null) : undefined)}>
        <DialogContent className="max-w-md">{irnFor ? <IrnForm key={irnFor.id} row={irnFor} onClose={() => setIrnFor(null)} onDone={reload} /> : null}</DialogContent>
      </Dialog>
      <Dialog open={ewayOpen} onOpenChange={setEwayOpen}>
        <DialogContent className="max-w-md">{ewayOpen ? <EwayForm ids={selected} onClose={() => setEwayOpen(false)} /> : null}</DialogContent>
      </Dialog>
    </div>
  );
}

function IrnForm({ row, onClose, onDone }: { row: EInvoiceRow; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("GstHub.docs.einv");
  const [irn, setIrn] = useState(row.irn ?? "");
  const [ack, setAck] = useState("");
  const [ackDate, setAckDate] = useState(new Date().toISOString().slice(0, 10));
  const [eway, setEway] = useState(row.ewayBillNo ?? "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await callApi("PATCH", `/api/gst/invoices/${row.id}`, { irn: irn.trim().toLowerCase() || null, irnAckNo: ack.trim() || null, irnAckDate: irn.trim() ? ackDate : null, ewayBillNo: eway.trim() || null });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(t("saved"));
    onDone();
    onClose();
  }
  return (
    <>
      <DialogHeader><DialogTitle>{t("recordTitle", { number: row.number })}</DialogTitle><DialogDescription>{t("recordBody")}</DialogDescription></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="irn">IRN</Label><Input id="irn" value={irn} maxLength={64} onChange={(e) => setIrn(e.target.value)} className="font-mono text-xs" placeholder="64 hexadecimal characters" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label htmlFor="ack">{t("ackNo")}</Label><Input id="ack" value={ack} onChange={(e) => setAck(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ackd">{t("ackDate")}</Label><Input id="ackd" type="date" value={ackDate} onChange={(e) => setAckDate(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="ewb">{t("ewayNo")}</Label><Input id="ewb" value={eway} maxLength={20} onChange={(e) => setEway(e.target.value)} /></div>
      </div>
      <DialogFooter className="gap-2 sm:gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>{t("cancel")}</Button><Button onClick={save} disabled={busy}>{busy ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden /> : null}{t("save")}</Button></DialogFooter>
    </>
  );
}

function EwayForm({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const t = useTranslations("GstHub.docs.einv");
  const [v, setV] = useState({ vehicleNo: "", distanceKm: "", fromPin: "", toPin: "", transporterId: "", mode: "1" });
  const [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/gst/eway", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceIds: ids, transport: { mode: Number(v.mode), distanceKm: Number(v.distanceKm), vehicleNo: v.vehicleNo, fromPin: v.fromPin, toPin: v.toPin, transporterId: v.transporterId || undefined } }) });
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error ?? t("failed")); }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `eway_bulk_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(t("ewayDone"));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  return (
    <>
      <DialogHeader><DialogTitle>{t("ewayTitle", { count: ids.length })}</DialogTitle><DialogDescription>{t("ewayBody")}</DialogDescription></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="ew-veh">{t("vehicle")}</Label><Input id="ew-veh" value={v.vehicleNo} onChange={(e) => set("vehicleNo", e.target.value.toUpperCase())} placeholder="MH12AB1234" /></div>
        <div className="space-y-1.5"><Label htmlFor="ew-dist">{t("distance")}</Label><Input id="ew-dist" inputMode="numeric" value={v.distanceKm} onChange={(e) => set("distanceKm", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="ew-from">{t("fromPin")}</Label><Input id="ew-from" inputMode="numeric" maxLength={6} value={v.fromPin} onChange={(e) => set("fromPin", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="ew-to">{t("toPin")}</Label><Input id="ew-to" inputMode="numeric" maxLength={6} value={v.toPin} onChange={(e) => set("toPin", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{t("mode")}</Label>
          <Select value={v.mode} onValueChange={(x) => set("mode", x)}><SelectTrigger aria-label={t("mode")}><SelectValue /></SelectTrigger><SelectContent>{["1", "2", "3", "4"].map((k) => <SelectItem key={k} value={k}>{t(`modes.${k}`)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor="ew-tr">{t("transporter")}</Label><Input id="ew-tr" value={v.transporterId} maxLength={15} onChange={(e) => set("transporterId", e.target.value.toUpperCase())} /></div>
      </div>
      <DialogFooter className="gap-2 sm:gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>{t("cancel")}</Button><Button onClick={generate} disabled={busy}>{busy ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden /> : <Download className="me-2 size-4" aria-hidden />}{t("generate")}</Button></DialogFooter>
    </>
  );
}

type Item = Record<string, string | number | null>;
type Field = { name: string; kind: "text" | "date" | "number" | "state" | "rate" | "period"; required?: boolean };
const FIELDS: Record<"debit-notes" | "amendments" | "advances", Field[]> = {
  "debit-notes": [{ name: "noteNumber", kind: "text", required: true }, { name: "issuedAt", kind: "date", required: true }, { name: "invoiceNumber", kind: "text" }, { name: "recipientName", kind: "text", required: true }, { name: "recipientGstin", kind: "text" }, { name: "pos", kind: "state", required: true }, { name: "rate", kind: "rate", required: true }, { name: "taxable", kind: "number", required: true }, { name: "reason", kind: "text", required: true }],
  amendments: [{ name: "periodKey", kind: "period", required: true }, { name: "originalPeriodKey", kind: "period", required: true }, { name: "originalNumber", kind: "text", required: true }, { name: "originalDate", kind: "date", required: true }, { name: "recipientName", kind: "text" }, { name: "recipientGstin", kind: "text" }, { name: "pos", kind: "state", required: true }, { name: "rate", kind: "rate", required: true }, { name: "originalTaxable", kind: "number", required: true }, { name: "revisedTaxable", kind: "number", required: true }, { name: "reason", kind: "text", required: true }],
  advances: [{ name: "receivedAt", kind: "date", required: true }, { name: "party", kind: "text", required: true }, { name: "recipientGstin", kind: "text" }, { name: "pos", kind: "state", required: true }, { name: "rate", kind: "rate", required: true }, { name: "amount", kind: "number", required: true }, { name: "notes", kind: "text" }],
};

function NotesPanel({ kind, canManage, obligations }: { kind: "debit-notes" | "amendments" | "advances"; canManage: boolean; obligations: ObligationView[] }) {
  const t = useTranslations(`GstHub.docs.${kind === "debit-notes" ? "debit" : kind === "amendments" ? "amend" : "adv"}`);
  const tc = useTranslations("GstHub.docs");
  const { n } = useMoney();
  const { data, loading, error, reload } = useJson<{ items: Item[] }>(`/api/gst/docs/${kind}`);
  const [adding, setAdding] = useState(false);
  const [adjusting, setAdjusting] = useState<Item | null>(null);
  const items = data?.items ?? [];

  async function remove(id: string) {
    const r = await callApi("DELETE", `/api/gst/docs/${kind}?id=${encodeURIComponent(id)}`);
    if (!r.ok) return void toast.error(r.error);
    toast.success(tc("removed"));
    reload();
  }

  return (
    <Section title={t("title")} hint={t("hint")} right={canManage ? <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="me-1.5 size-4" aria-hidden />{tc("add")}</Button> : null}>
      {error ? <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}
      {loading && !data ? <Skeleton className="h-24 rounded-xl" /> : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center"><EmptyArt variant="returns" /><p className="text-sm font-medium">{t("emptyTitle")}</p><p className="max-w-sm text-xs text-muted-foreground">{t("emptyBody")}</p></div>
      ) : (
        <ul className="divide-y divide-border/50">
          {items.map((it) => (
            <li key={String(it.id)} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{String(it.number ?? it.party)}<span className="ms-2 text-xs font-normal text-muted-foreground">{String(it.date ?? "")}</span></p>
                <p className="text-xs text-muted-foreground">{String(it.party ?? "")}{it.invoiceNumber ? ` · ${t("against", { number: String(it.invoiceNumber) })}` : ""}{it.reason ? ` · ${String(it.reason)}` : ""}{it.periodKey ? ` · ${t("reportedIn", { period: String(it.periodKey) })}` : ""}</p>
                {kind === "advances" ? <p className="text-xs text-muted-foreground">{it.adjustedAt ? t("adjustedOn", { date: String(it.adjustedAt), invoice: String(it.adjustedInvoice ?? "") }) : t("open")}</p> : null}
              </div>
              <div className="text-end text-sm tabular-nums">
                {kind === "amendments" ? <><p className="font-semibold">{n(Number(it.delta))}</p><p className="text-xs text-muted-foreground">{n(Number(it.originalTaxable))} → {n(Number(it.revisedTaxable))}</p></> : kind === "advances" ? <><p className="font-semibold">{n(Number(it.amount))}</p><p className="text-xs text-muted-foreground">{t("gst", { amount: n(Number(it.tax)) })}</p></> : <><p className="font-semibold">{n(Number(it.taxable))}</p><p className="text-xs text-muted-foreground">{t("gst", { amount: n(Number(it.tax)) })}</p></>}
              </div>
              {canManage && kind === "advances" && !it.adjustedAt ? <Button size="sm" variant="ghost" onClick={() => setAdjusting(it)}>{t("adjust")}</Button> : null}
              {canManage ? <Button size="icon" variant="ghost" aria-label={tc("delete")} onClick={() => remove(String(it.id))}><Trash2 className="size-4" aria-hidden /></Button> : null}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">{adding ? <DocForm kind={kind} obligations={obligations} onClose={() => setAdding(false)} onDone={reload} /> : null}</DialogContent>
      </Dialog>
      <Dialog open={!!adjusting} onOpenChange={(o) => (!o ? setAdjusting(null) : undefined)}>
        <DialogContent className="max-w-sm">{adjusting ? <AdjustForm item={adjusting} onClose={() => setAdjusting(null)} onDone={reload} /> : null}</DialogContent>
      </Dialog>
    </Section>
  );
}

function DocForm({ kind, obligations, onClose, onDone }: { kind: "debit-notes" | "amendments" | "advances"; obligations: ObligationView[]; onClose: () => void; onDone: () => void }) {
  const t = useTranslations(`GstHub.docs.${kind === "debit-notes" ? "debit" : kind === "amendments" ? "amend" : "adv"}`);
  const tc = useTranslations("GstHub.docs");
  const [v, setV] = useState<Record<string, string>>({ rate: "18", pos: "", issuedAt: new Date().toISOString().slice(0, 10), receivedAt: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const periods = Array.from(new Set(obligations.filter((o) => o.returnType === "GSTR1").map((o) => o.periodKey)));
  const set = (k: string, x: string) => setV((p) => ({ ...p, [k]: x }));

  async function save() {
    setBusy(true);
    const body: Record<string, unknown> = {};
    for (const f of FIELDS[kind]) {
      const raw = (v[f.name] ?? "").trim();
      if (!raw && !f.required) continue;
      body[f.name] = f.kind === "number" || f.kind === "rate" ? Number(raw) : raw;
    }
    const r = await callApi("POST", `/api/gst/docs/${kind}`, body);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(tc("saved"));
    onDone();
    onClose();
  }

  return (
    <>
      <DialogHeader><DialogTitle>{t("addTitle")}</DialogTitle><DialogDescription>{t("addBody")}</DialogDescription></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS[kind].map((f) => (
          <div key={f.name} className={cn("space-y-1.5", (f.name === "reason" || f.name === "notes") && "sm:col-span-2")}>
            <Label htmlFor={`f-${f.name}`}>{t(`fields.${f.name}`)}{f.required ? " *" : ""}</Label>
            {f.kind === "state" ? (
              <Select value={v[f.name] || undefined} onValueChange={(x) => set(f.name, x)}><SelectTrigger id={`f-${f.name}`} aria-label={t(`fields.${f.name}`)}><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{[...GST_STATES, { code: "96", name: tc("outsideIndia") }].map((s) => <SelectItem key={s.code} value={s.code}>{s.code} · {s.name}</SelectItem>)}</SelectContent></Select>
            ) : f.kind === "rate" ? (
              <Select value={v[f.name]} onValueChange={(x) => set(f.name, x)}><SelectTrigger id={`f-${f.name}`} aria-label={t(`fields.${f.name}`)}><SelectValue /></SelectTrigger><SelectContent>{RATES.map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent></Select>
            ) : f.kind === "period" ? (
              <Select value={v[f.name] || undefined} onValueChange={(x) => set(f.name, x)}><SelectTrigger id={`f-${f.name}`} aria-label={t(`fields.${f.name}`)}><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
            ) : (
              <Input id={`f-${f.name}`} type={f.kind === "date" ? "date" : "text"} inputMode={f.kind === "number" ? "decimal" : undefined} value={v[f.name] ?? ""} onChange={(e) => set(f.name, f.name.toLowerCase().includes("gstin") ? e.target.value.toUpperCase() : e.target.value)} />
            )}
          </div>
        ))}
      </div>
      <DialogFooter className="gap-2 sm:gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>{tc("cancel")}</Button><Button onClick={save} disabled={busy}>{busy ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden /> : null}{tc("save")}</Button></DialogFooter>
    </>
  );
}

function AdjustForm({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("GstHub.docs.adv");
  const tc = useTranslations("GstHub.docs");
  const [invoice, setInvoice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await callApi("PATCH", "/api/gst/docs/advances", { id: item.id, adjustedAt: date, adjustedInvoice: invoice });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(tc("saved"));
    onDone();
    onClose();
  }
  return (
    <>
      <DialogHeader><DialogTitle>{t("adjustTitle")}</DialogTitle><DialogDescription>{t("adjustBody")}</DialogDescription></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="adj-inv">{t("invoiceNo")}</Label><Input id="adj-inv" value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="adj-date">{t("adjustedDate")}</Label><Input id="adj-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <DialogFooter className="gap-2 sm:gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>{tc("cancel")}</Button><Button onClick={save} disabled={busy || !invoice.trim()}>{tc("save")}</Button></DialogFooter>
    </>
  );
}
