"use client";

import { GstPreviewCard, useGstPreview } from "@/components/gst/GstPreviewCard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Circle, Loader2, Lock, Plus, Save, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TaxRateModal } from "@/components/invoice/tax-rate-modal";
import { ComposerSection } from "@/components/invoice/composer/ComposerSection";
import { AnimatedMoney } from "@/components/invoice/composer/AnimatedMoney";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import type { RetainerDetailDto, RetainerPreviewDto } from "@/lib/retainers/types";
import { upcomingDates } from "@/lib/retainers/schedule";
import { formatDate, formatMoney } from "../_components/retainer-utils";
import { useJson } from "../_components/use-retainers-data";

type Draft = { key: string; serviceTemplateId: string | null; title: string; quantity: string; unitPrice: string; taxRate: string };
type Catalog = { id: string; name: string; description: string | null; defaultPrice: string | number };
type ClientOption = { id: string; name: string; email: string | null };
type Initial = { clientId: string; name: string; notes: string; frequency: string; nextBillingDate: string; endDate: string; maxCycles: string; autoAppendMonth: boolean; emailInvoice: boolean; remindersEnabled: boolean; autoRenew: boolean; renewCycles: string; paymentTermsDays: string; items: Draft[] };

let n = 0;
const key = () => `r${Date.now().toString(36)}${(n++).toString(36)}`;
const blank = (): Draft => ({ key: key(), serviceTemplateId: null, title: "", quantity: "1", unitPrice: "", taxRate: "" });
const pad = (v: number) => String(v).padStart(2, "0");
const dateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const firstOfNextMonth = () => { const d = new Date(); return dateInput(new Date(d.getFullYear(), d.getMonth() + 1, 1)); };

function fromDetail(r: RetainerDetailDto): Initial {
  return {
    clientId: r.clientId, name: r.name, notes: r.notes ?? "", frequency: r.frequency, nextBillingDate: r.nextBillingDate.slice(0, 10), endDate: r.endDate ? r.endDate.slice(0, 10) : "",
    maxCycles: r.maxCycles ? String(r.maxCycles) : "", autoAppendMonth: r.autoAppendMonth, emailInvoice: r.emailInvoice, remindersEnabled: r.remindersEnabled, autoRenew: r.autoRenew, renewCycles: r.renewCycles ? String(r.renewCycles) : "", paymentTermsDays: String(r.paymentTermsDays),
    items: r.items.map((i) => ({ key: key(), serviceTemplateId: i.serviceTemplateId, title: i.title, quantity: String(i.quantity), unitPrice: String(Number(i.unitPrice)), taxRate: i.taxRatePercent ? String(i.taxRatePercent) : "" })),
  };
}

function readAiPayload(clients: ClientOption[], catalog: Catalog[]): Partial<Initial> | null {
  try {
    const raw = sessionStorage.getItem("erp_ai_payload");
    if (!raw) return null;
    const { path, data, timestamp } = JSON.parse(raw) as { path?: string; data?: Record<string, unknown>; timestamp?: number };
    if (path !== "/retainers" || !data || !timestamp || Date.now() - timestamp > 15_000) return null;
    const out: Partial<Initial> = {};
    const svc = (typeof data.serviceTemplateId === "string" && catalog.find((c) => c.id === data.serviceTemplateId)) || (typeof data.serviceName === "string" ? catalog.find((c) => c.name.toLowerCase().includes((data.serviceName as string).toLowerCase())) : undefined);
    const title = svc?.name ?? (typeof data.serviceName === "string" ? data.serviceName : "");
    const price = data.amount !== undefined ? Number(data.amount) : svc ? Number(svc.defaultPrice) : NaN;
    if (title || Number.isFinite(price)) out.items = [{ ...blank(), serviceTemplateId: svc?.id ?? null, title, unitPrice: Number.isFinite(price) ? String(price) : "" }];
    if (title) out.name = title;
    if (typeof data.client === "string") { const c = clients.find((x) => x.name.toLowerCase().includes((data.client as string).toLowerCase())); if (c) out.clientId = c.id; }
    return out;
  } catch { return null; }
}

export function RetainerComposer({ retainerId }: { retainerId?: string }) {
  const t = useTranslations("RetainersHub.composer");
  const clients = useJson<{ data: ClientOption[] }>("/api/clients?limit=100");
  const services = useJson<Catalog[]>("/api/services?limit=200");
  const existing = useJson<{ data: RetainerDetailDto }>(retainerId ? `/api/retainers/${retainerId}` : null);

  if (clients.error || (retainerId && existing.error && !existing.data)) {
    return <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{clients.error || existing.error || t("loadFailed")}</p>;
  }
  if (!clients.data || (retainerId && !existing.data)) {
    return <div className="space-y-4" aria-busy><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;
  }
  const detail = existing.data?.data ?? null;
  if (detail && (detail.status === "CANCELLED" || detail.status === "COMPLETED")) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold">{t("locked.title")}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t("locked.description")}</p>
        <Button asChild variant="outline"><Link href={`/retainers?retainer=${detail.id}`}>{t("locked.back")}</Link></Button>
      </div>
    );
  }
  return <Form key={detail?.id ?? "new"} retainerId={retainerId} detail={detail} clients={clients.data.data ?? []} catalog={Array.isArray(services.data) ? services.data : []} catalogLoading={services.loading && !services.data} />;
}

type FormProps = { retainerId?: string; detail: RetainerDetailDto | null; clients: ClientOption[]; catalog: Catalog[]; catalogLoading: boolean };
type PreviewState = { key: string; data: RetainerPreviewDto | null; error: string | null };

function Form({ retainerId, detail, clients, catalog, catalogLoading }: FormProps) {
  const t = useTranslations("RetainersHub.composer");
  const tf = useTranslations("RetainersHub.frequency");
  const router = useRouter();
  const sp = useSearchParams();
  const { locale, currency: sessionCurrency } = useFormat();
  const currency = detail?.currency ?? sessionCurrency;

  const [initial] = useState<Initial>(() => {
    if (detail) return fromDetail(detail);
    const base: Initial = { clientId: sp.get("client") ?? "", name: "", notes: "", frequency: "MONTHLY", nextBillingDate: firstOfNextMonth(), endDate: "", maxCycles: "", autoAppendMonth: true, emailInvoice: true, remindersEnabled: true, autoRenew: false, renewCycles: "", paymentTermsDays: "7", items: [blank()] };
    const ai = typeof window !== "undefined" ? readAiPayload(clients, catalog) : null;
    return ai ? { ...base, ...ai } : base;
  });
  const [clientId, setClientId] = useState(initial.clientId);
  const [name, setName] = useState(initial.name);
  const [notes, setNotes] = useState(initial.notes);
  const [frequency, setFrequency] = useState(initial.frequency);
  const [nextBillingDate, setNext] = useState(initial.nextBillingDate);
  const [endDate, setEnd] = useState(initial.endDate);
  const [maxCycles, setMax] = useState(initial.maxCycles);
  const [autoAppendMonth, setAuto] = useState(initial.autoAppendMonth);
  const [emailInvoice, setEmailInvoice] = useState(initial.emailInvoice);
  const [remindersEnabled, setReminders] = useState(initial.remindersEnabled);
  const [autoRenew, setAutoRenew] = useState(initial.autoRenew);
  const [renewCycles, setRenewCycles] = useState(initial.renewCycles);
  const [terms, setTerms] = useState(initial.paymentTermsDays);
  const [items, setItems] = useState(initial.items);
  const [query, setQuery] = useState("");
  const [taxOverride, setTaxOverride] = useState<number | null>(null);
  const [taxModal, setTaxModal] = useState<{ open: boolean; label: string; country?: string; candidates: number[] }>({ open: false, label: "Tax", candidates: [] });
  const [taxInput, setTaxInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const touch = useCallback(() => { dirty.current = true; }, []);
  const mark = <V,>(set: (v: V) => void) => (v: V) => { touch(); set(v); };

  // Draft autosave (this browser only): survives a refresh or a closed tab, cleared on save.
  const draftKey = `erp-retainer-draft:${retainerId ?? "new"}`;
  const snapshot = useMemo(() => ({ clientId, name, notes, frequency, nextBillingDate, endDate, maxCycles, autoAppendMonth, emailInvoice, remindersEnabled, autoRenew, renewCycles, paymentTermsDays: terms, items }), [clientId, name, notes, frequency, nextBillingDate, endDate, maxCycles, autoAppendMonth, emailInvoice, remindersEnabled, autoRenew, renewCycles, terms, items]);
  const [restorable, setRestorable] = useState<{ at: number; data: Initial } | null>(() => {
    try {
      const raw = typeof window === "undefined" ? null : localStorage.getItem(draftKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { at?: number; data?: Initial };
      return parsed.data && Array.isArray(parsed.data.items) ? { at: parsed.at ?? Date.now(), data: parsed.data } : null;
    } catch { return null; }
  });
  useEffect(() => {
    if (!dirty.current) return;
    const id = window.setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), data: snapshot })); } catch { /* storage unavailable */ } }, 800);
    return () => window.clearTimeout(id);
  }, [snapshot, draftKey]);
  const restoreDraft = () => {
    if (!restorable) return;
    const d = restorable.data;
    touch();
    setClientId(d.clientId); setName(d.name); setNotes(d.notes); setFrequency(d.frequency); setNext(d.nextBillingDate); setEnd(d.endDate); setMax(d.maxCycles);
    setAuto(d.autoAppendMonth); setEmailInvoice(d.emailInvoice); setReminders(d.remindersEnabled ?? true); setAutoRenew(d.autoRenew ?? false); setRenewCycles(d.renewCycles ?? "");
    setTerms(d.paymentTermsDays); setItems(d.items.length ? d.items : [blank()]); setRestorable(null);
  };
  const discardDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* storage unavailable */ } setRestorable(null); };

  useEffect(() => { try { sessionStorage.removeItem("erp_ai_payload"); } catch { /* storage unavailable */ } }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const client = clients.find((c) => c.id === clientId) ?? (detail && detail.clientId === clientId ? { id: detail.clientId, name: detail.clientName, email: detail.clientEmail } : null);
  const clientOptions = client && !clients.some((c) => c.id === client.id) ? [client, ...clients] : clients;
  const fmt = useCallback((v: number) => formatMoney(v, currency, locale), [currency, locale]);

  const valid = useMemo(() => items.filter((i) => i.title.trim() && Number(i.quantity) >= 1 && i.unitPrice !== "" && Number(i.unitPrice) >= 0), [items]);
  const priced = useMemo(
    () => valid.map((i) => ({ serviceTemplateId: i.serviceTemplateId, title: i.title.trim(), quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), taxRate: i.taxRate === "" ? null : Number(i.taxRate) })),
    [valid],
  );
  const body = useMemo(() => (clientId && priced.length ? { clientId, frequency, items: priced, ...(taxOverride !== null ? { taxRateOverride: taxOverride } : {}) } : null), [clientId, frequency, priced, taxOverride]);
  const bodyKey = body ? JSON.stringify(body) : "";
  const [preview, setPreview] = useState<PreviewState>({ key: "", data: null, error: null });

  useEffect(() => {
    if (!body) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/retainers/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: bodyKey, signal: controller.signal });
        const payload = await res.json().catch(() => null);
        if (res.ok) { setPreview({ key: bodyKey, data: payload as RetainerPreviewDto, error: null }); return; }
        if (payload?.code === "TAX_RATE_REQUIRED") setTaxModal({ open: true, label: payload.taxLabel || "Tax", country: payload.countryCode, candidates: Array.isArray(payload.candidates) ? payload.candidates : [] });
        setPreview({ key: bodyKey, data: null, error: typeof payload?.error === "string" ? payload.error : t("previewFailed") });
      } catch (e) {
        if ((e as { name?: string }).name !== "AbortError") setPreview({ key: bodyKey, data: null, error: t("previewFailed") });
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [body, bodyKey, t]);

  const ready = preview.key === bodyKey && bodyKey !== "";
  const server = ready ? preview.data : null;
  const pricing = bodyKey !== "" && !ready;
  const gstView = useGstPreview({
    clientId: clientId || null,
    lines: priced.map((i) => ({ description: i.title, amount: i.quantity * i.unitPrice, quantity: i.quantity, serviceTemplateId: i.serviceTemplateId, ratePercent: i.taxRate })),
  });
  const localSubtotal = priced.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
  const total = server ? Number(server.total) : localSubtotal;

  const today = dateInput(new Date());
  const limits = useMemo(() => ({ endDate: endDate ? new Date(endDate) : null, maxCycles: maxCycles ? Number(maxCycles) : null, cyclesBilled: detail?.cyclesBilled ?? 0 }), [endDate, maxCycles, detail]);
  const upcoming = useMemo(() => (nextBillingDate ? upcomingDates(new Date(nextBillingDate), frequency, limits, 4) : []), [nextBillingDate, frequency, limits]);

  const hasLimit = Boolean(endDate || maxCycles);
  const checks = {
    client: Boolean(clientId),
    name: name.trim().length > 0,
    items: priced.length > 0 && items.every((i) => !(i.title.trim() || i.unitPrice) || (i.title.trim() && i.unitPrice !== "")),
    date: Boolean(nextBillingDate) && (Boolean(retainerId) || nextBillingDate >= today),
    end: !endDate || endDate >= nextBillingDate,
    renew: !(autoRenew && hasLimit) || Number(renewCycles) >= 1,
  };
  const canSave = checks.client && checks.name && checks.items && checks.date && checks.end && checks.renew && !pricing && !(ready && preview.error) && terms !== "";

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    const payload = {
      clientId, name: name.trim(), notes, frequency, nextBillingDate, endDate: endDate || null, maxCycles: maxCycles ? Number(maxCycles) : null,
      autoAppendMonth, emailInvoice, remindersEnabled, autoRenew: autoRenew && hasLimit, renewCycles: autoRenew && hasLimit ? Number(renewCycles || 0) || null : null, paymentTermsDays: Number(terms || 7),
      items: valid.map((i) => ({ serviceTemplateId: i.serviceTemplateId, title: i.title.trim(), quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), taxRate: i.taxRate === "" ? null : Number(i.taxRate) })),
      ...(taxOverride !== null ? { taxRateOverride: taxOverride } : {}),
    };
    try {
      const res = await fetch(retainerId ? `/api/retainers/${retainerId}` : "/api/retainers", { method: retainerId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const out = (await res.json().catch(() => null)) as { error?: string; retainer?: { id: string } } | null;
      if (!res.ok || !out?.retainer) { setError(out?.error || t("saveFailed")); return; }
      dirty.current = false;
      try { localStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
      toast.success(retainerId ? t("updated") : t("created"));
      router.push(`/retainers?retainer=${out.retainer.id}`);
    } catch { setError(t("saveFailed")); } finally { setBusy(false); }
  };

  const patch = (k: string, next: Partial<Draft>) => { touch(); setItems((list) => list.map((i) => (i.key === k ? { ...i, ...next } : i))); };
  const matches = catalog.filter((s) => !query.trim() || s.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);
  const addService = (s: Catalog) => {
    touch();
    setItems((list) => [...list.filter((i) => i.title.trim() || i.unitPrice), { key: key(), serviceTemplateId: s.id, title: s.name, quantity: "1", unitPrice: String(Number(s.defaultPrice) || ""), taxRate: "" }]);
    if (!name.trim()) setName(s.name);
  };

  const checklist: Array<[string, boolean]> = [[t("check.client"), checks.client], [t("check.name"), checks.name], [t("check.items"), checks.items], [t("check.schedule"), checks.date && checks.end]];
  const saveButton = (compact: boolean) => (
    <Button type="submit" variant="primary-action" size="lg" disabled={!canSave || busy} className={cn("h-12 gap-2 rounded-xl font-semibold", !compact && "w-full")}>
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
      {retainerId ? t("saveChanges") : t("start")}
    </Button>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_22rem] lg:pb-0" noValidate>
      <div className="min-w-0 space-y-5">
        {restorable && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-3 text-sm">
            <span>{t("draft.found", { time: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(restorable.at)) })}</span>
            <span className="flex gap-2">
              <Button type="button" size="sm" variant="primary-action" onClick={restoreDraft}>{t("draft.restore")}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={discardDraft}>{t("draft.discard")}</Button>
            </span>
          </div>
        )}
        <ComposerSection step={1} title={t("basics.title")} hint={t("basics.hint")} done={checks.client && checks.name}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rc-client">{t("basics.client")}</Label>
              <Select value={clientId} onValueChange={mark(setClientId)}>
                <SelectTrigger id="rc-client" className="h-11 w-full"><SelectValue placeholder={t("basics.clientPlaceholder")} /></SelectTrigger>
                <SelectContent>{clientOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              {client && !client.email && <p className="text-xs text-amber-700 dark:text-amber-400">{t("basics.noEmail")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-name">{t("basics.name")}</Label>
              <Input id="rc-name" value={name} maxLength={200} onChange={(e) => mark(setName)(e.target.value)} placeholder={t("basics.namePlaceholder")} className="h-11" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rc-notes">{t("basics.notes")}</Label>
              <Textarea id="rc-notes" value={notes} maxLength={2000} rows={2} onChange={(e) => mark(setNotes)(e.target.value)} placeholder={t("basics.notesPlaceholder")} />
            </div>
          </div>
        </ComposerSection>

        <ComposerSection step={2} title={t("items.sectionTitle")} hint={t("items.hint")} done={checks.items} delay={0.05}>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("items.search")} aria-label={t("items.search")} className="h-11 rounded-xl ps-9" />
              </div>
              {catalogLoading ? <p className="text-sm text-muted-foreground">{t("items.loading")}</p> : catalog.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("items.emptyCatalog")} <Link href="/services" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">{t("items.emptyCatalogCta")}</Link></p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {matches.map((s) => (
                    <button key={s.id} type="button" onClick={() => addService(s)} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:border-indigo-500/60 hover:bg-indigo-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Plus className="size-3.5 shrink-0 text-indigo-600" aria-hidden /><span className="truncate">{s.name}</span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmt(Number(s.defaultPrice) || 0)}</span>
                    </button>
                  ))}
                  {matches.length === 0 && <p className="text-sm text-muted-foreground">{t("items.noMatches")}</p>}
                </div>
              )}
            </div>
            <ul className="space-y-3">
              {items.map((i, idx) => {
                const line = (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0);
                return (
                  <li key={i.key} className="space-y-3 rounded-xl border border-border/70 bg-background p-3 sm:p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_5rem_8rem_6rem]">
                      <div className="space-y-1"><label htmlFor={`ri-t-${i.key}`} className="text-xs font-medium text-muted-foreground">{t("items.title")}</label><Input id={`ri-t-${i.key}`} value={i.title} maxLength={200} onChange={(e) => patch(i.key, { title: e.target.value })} placeholder={t("items.titlePlaceholder")} className="h-10" /></div>
                      <div className="space-y-1"><label htmlFor={`ri-q-${i.key}`} className="text-xs font-medium text-muted-foreground">{t("items.quantity")}</label><Input id={`ri-q-${i.key}`} inputMode="numeric" value={i.quantity} onChange={(e) => patch(i.key, { quantity: e.target.value.replace(/[^0-9]/g, "") })} className="h-10 tabular-nums" /></div>
                      <div className="space-y-1"><label htmlFor={`ri-p-${i.key}`} className="text-xs font-medium text-muted-foreground">{t("items.unitPrice")}</label><Input id={`ri-p-${i.key}`} inputMode="decimal" value={i.unitPrice} onChange={(e) => patch(i.key, { unitPrice: e.target.value.replace(/[^0-9.]/g, "") })} className="h-10 tabular-nums" /></div>
                      <div className="space-y-1"><label htmlFor={`ri-x-${i.key}`} className="text-xs font-medium text-muted-foreground">{t("items.taxRate")}</label><Input id={`ri-x-${i.key}`} inputMode="decimal" value={i.taxRate} onChange={(e) => patch(i.key, { taxRate: e.target.value.replace(/[^0-9.]/g, "") })} placeholder={t("items.taxAuto")} className="h-10 tabular-nums" /></div>
                    </div>
                    {i.title.trim() && i.unitPrice === "" && <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">{t("items.priceRequired")}</p>}
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-sm font-semibold tabular-nums">{fmt(line)}</span>
                      <Button type="button" size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-rose-600" onClick={() => { touch(); setItems((l) => l.filter((x) => x.key !== i.key)); }} aria-label={t("items.remove", { n: idx + 1 })}><Trash2 className="size-4" aria-hidden /></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Button type="button" variant="outline" className="gap-1.5 rounded-xl" onClick={() => { touch(); setItems((l) => [...l, blank()]); }}><Plus className="size-4" aria-hidden /> {t("items.addCustom")}</Button>
          </div>
        </ComposerSection>

        <GstPreviewCard preview={gstView.preview} loading={gstView.loading} format={fmt} />

        <ComposerSection step={3} title={t("schedule.title")} hint={t("schedule.hint")} done={checks.date && checks.end} delay={0.1}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rc-freq">{t("schedule.frequency")}</Label>
              <Select value={frequency} onValueChange={mark(setFrequency)}>
                <SelectTrigger id="rc-freq" className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{["MONTHLY", "QUARTERLY", "ANNUALLY"].map((f) => <SelectItem key={f} value={f}>{tf(f)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-next">{retainerId ? t("schedule.nextBilling") : t("schedule.firstBilling")}</Label>
              <Input id="rc-next" type="date" min={retainerId ? undefined : today} value={nextBillingDate} onChange={(e) => mark(setNext)(e.target.value)} className="h-11" />
              {!checks.date && <p role="alert" className="text-xs text-rose-600">{t("schedule.datePast")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-end">{t("schedule.endDate")}</Label>
              <Input id="rc-end" type="date" min={nextBillingDate} value={endDate} onChange={(e) => mark(setEnd)(e.target.value)} className="h-11" />
              {!checks.end && <p role="alert" className="text-xs text-rose-600">{t("schedule.endBefore")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-max">{t("schedule.maxCycles")}</Label>
              <Input id="rc-max" inputMode="numeric" value={maxCycles} onChange={(e) => mark(setMax)(e.target.value.replace(/[^0-9]/g, ""))} placeholder={t("schedule.unlimited")} className="h-11 tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-terms">{t("schedule.terms")}</Label>
              <Input id="rc-terms" inputMode="numeric" value={terms} onChange={(e) => mark(setTerms)(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} className="h-11 tabular-nums" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3 text-sm">
                <input type="checkbox" checked={autoAppendMonth} onChange={(e) => mark(setAuto)(e.target.checked)} className="mt-0.5 size-4 rounded border-border accent-indigo-600" />
                <span><span className="block font-medium">{t("schedule.smartNaming")}</span><span className="text-xs text-muted-foreground">{t("schedule.smartNamingHint")}</span></span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3 text-sm">
                <input type="checkbox" checked={remindersEnabled} onChange={(e) => mark(setReminders)(e.target.checked)} className="mt-0.5 size-4 rounded border-border accent-indigo-600" />
                <span><span className="block font-medium">{t("schedule.reminders")}</span><span className="text-xs text-muted-foreground">{t("schedule.remindersHint")}</span></span>
              </label>
              <div className={cn("rounded-xl border border-border/70 p-3 text-sm", !hasLimit && "opacity-60")}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" disabled={!hasLimit} checked={autoRenew && hasLimit} onChange={(e) => mark(setAutoRenew)(e.target.checked)} className="mt-0.5 size-4 rounded border-border accent-indigo-600" />
                  <span><span className="block font-medium">{t("schedule.renew")}</span><span className="text-xs text-muted-foreground">{hasLimit ? t("schedule.renewHint") : t("schedule.renewNeedsLimit")}</span></span>
                </label>
                {autoRenew && hasLimit && (
                  <div className="mt-3 flex items-center gap-2 ps-7">
                    <Label htmlFor="rc-renew" className="text-xs">{t("schedule.renewBy")}</Label>
                    <Input id="rc-renew" inputMode="numeric" value={renewCycles} onChange={(e) => mark(setRenewCycles)(e.target.value.replace(/[^0-9]/g, ""))} className="h-9 w-24 tabular-nums" />
                    <span className="text-xs text-muted-foreground">{t("schedule.cycles")}</span>
                  </div>
                )}
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3 text-sm">
                <input type="checkbox" checked={emailInvoice} onChange={(e) => mark(setEmailInvoice)(e.target.checked)} className="mt-0.5 size-4 rounded border-border accent-indigo-600" />
                <span><span className="block font-medium">{t("schedule.email")}</span><span className="text-xs text-muted-foreground">{t("schedule.emailHint")}</span></span>
              </label>
            </div>
          </div>
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold">{t("schedule.upcoming")}</h3>
            {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">{t("schedule.noUpcoming")}</p> : (
              <ol className="flex flex-wrap gap-2">
                {upcoming.map((d) => <li key={d.toISOString()} className="rounded-lg border border-border/70 px-2.5 py-1.5 text-xs tabular-nums"><span className="font-semibold">{formatDate(d.toISOString(), locale)}</span> · {fmt(total)}</li>)}
              </ol>
            )}
          </div>
        </ComposerSection>
      </div>

      <aside className="hidden lg:block" aria-label={t("summary.title")}>
        <div className="sticky top-4 space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="text-base font-semibold">{t("summary.title")}</h2><span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{currency}</span></div>
          <p className={cn("truncate text-sm", client ? "font-medium" : "text-muted-foreground")}>{client?.name ?? t("summary.noClient")}</p>
          <dl className="space-y-1.5 text-sm tabular-nums">
            <div className="flex justify-between"><dt className="text-muted-foreground">{t("summary.subtotal")}</dt><dd>{fmt(server ? Number(server.subtotal) : localSubtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">{server ? server.taxLabel : t("summary.tax")}</dt><dd>{server ? fmt(Number(server.taxAmount)) : pricing ? <Loader2 className="size-3.5 animate-spin" aria-label={t("summary.pricing")} /> : "—"}</dd></div>
          </dl>
          <div className="border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground">{t("summary.perCycle", { frequency: tf(frequency) })}</p>
            <AnimatedMoney value={total} format={fmt} className="block text-3xl font-black tabular-nums tracking-tight" />
            {taxOverride !== null && <p className="mt-1 text-xs text-muted-foreground">{t("summary.override", { rate: taxOverride })}</p>}
          </div>
          <ul className="space-y-1.5 text-sm" aria-label={t("summary.checklist")}>
            {checklist.map(([label, ok]) => (
              <li key={label} className={cn("flex items-center gap-2", ok ? "text-foreground" : "text-muted-foreground")}>
                <span className={cn("flex size-4 items-center justify-center rounded-full", ok ? "bg-emerald-500 text-white" : "")}>{ok ? <Check className="size-3" aria-hidden /> : <Circle className="size-3" aria-hidden />}</span>{label}
              </li>
            ))}
          </ul>
          {ready && preview.error && <p role="alert" className="text-xs text-rose-600">{preview.error}</p>}
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
          {saveButton(false)}
          <p className="text-center text-xs text-muted-foreground">{t("summary.note")}</p>
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur lg:hidden">
        {error && <p role="alert" className="mx-auto mb-2 max-w-xl text-xs text-rose-600">{error}</p>}
        <div className="mx-auto flex max-w-xl items-center gap-3 pe-16 sm:pe-0">
          <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{t("summary.perCycle", { frequency: tf(frequency) })}</p><AnimatedMoney value={total} format={fmt} className="block truncate text-xl font-bold tabular-nums" /></div>
          {saveButton(true)}
        </div>
      </div>

      <TaxRateModal open={taxModal.open} onOpenChange={(open) => setTaxModal((m) => ({ ...m, open }))} title={t("tax.title")} description={t("tax.description")} taxLabel={taxModal.label} countryCode={taxModal.country} candidates={taxModal.candidates} value={taxInput} onValueChange={setTaxInput}
        onConfirm={() => { const rate = Number(taxInput); if (!Number.isFinite(rate) || rate < 0 || rate > 100) return; touch(); setTaxOverride(rate); setTaxModal((m) => ({ ...m, open: false })); }} />
    </form>
  );
}
