"use client";

import { GstPreviewCard, useGstPreview } from "@/components/gst/GstPreviewCard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Circle, Loader2, Lock, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TaxRateModal } from "@/components/invoice/tax-rate-modal";
import { ComposerSection } from "@/components/invoice/composer/ComposerSection";
import { AnimatedMoney } from "@/components/invoice/composer/AnimatedMoney";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import type { ProposalDetailDto, ProposalPreviewDto } from "@/lib/proposals/types";
import { formatMoney } from "../_components/proposal-utils";
import { useJson } from "../_components/use-proposals-data";
import { MediaEditor, MilestonesEditor, SectionsEditor } from "./ExtrasEditor";
import { ItemsEditor } from "./ItemsEditor";
import {
  blankItem,
  dateInput,
  defaultValidUntil,
  fromDetail,
  readAiPayload,
  type CatalogService,
  type ClientOption,
  type ComposerInitial,
} from "./composer-types";

/* ───────────── Loader: fetch everything, then mount the form with initial state (no sync setState in effects) ───────────── */

export function ProposalComposer({ proposalId }: { proposalId?: string }) {
  const t = useTranslations("ProposalsHub.composer");
  const clients = useJson<{ data: ClientOption[] }>("/api/clients?limit=100");
  const services = useJson<CatalogService[]>("/api/services?limit=200");
  const existing = useJson<{ data: ProposalDetailDto }>(proposalId ? `/api/proposals/${proposalId}` : null);

  const failed = clients.error || (proposalId && existing.error && !existing.data);
  if (failed) {
    return (
      <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
        {clients.error || existing.error || t("loadFailed")}
      </p>
    );
  }
  if (!clients.data || (proposalId && !existing.data)) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const detail = existing.data?.data ?? null;
  if (detail && !["DRAFT", "SENT", "VIEWED", "REVISION_REQUESTED", "DECLINED"].includes(detail.status)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold">{t("locked.title")}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t("locked.description")}</p>
        <Button asChild variant="outline">
          <Link href={`/proposals?proposal=${detail.id}`}>{t("locked.back")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <ComposerForm
      key={detail?.id ?? "new"}
      proposalId={proposalId}
      detail={detail}
      clients={clients.data.data ?? []}
      catalog={Array.isArray(services.data) ? services.data : []}
      catalogLoading={services.loading && !services.data}
    />
  );
}

/* ───────────── Form ───────────── */

type Props = {
  proposalId?: string;
  detail: ProposalDetailDto | null;
  clients: ClientOption[];
  catalog: CatalogService[];
  catalogLoading: boolean;
};

type PreviewState = { key: string; data: ProposalPreviewDto | null; error: string | null };

function buildInitial(detail: ProposalDetailDto | null, clients: ClientOption[]): ComposerInitial {
  if (detail) return fromDetail(detail);
  const base: ComposerInitial = { clientId: "", title: "", validUntil: defaultValidUntil(), items: [blankItem()], milestones: [], sections: [], media: [] };
  const ai = typeof window !== "undefined" ? readAiPayload(clients) : null;
  return ai ? { ...base, ...ai } : base;
}

function ComposerForm({ proposalId, detail, clients, catalog, catalogLoading }: Props) {
  const t = useTranslations("ProposalsHub.composer");
  const router = useRouter();
  const { locale, currency: sessionCurrency } = useFormat();
  const currency = detail?.currency ?? sessionCurrency;

  const [initial] = useState(() => buildInitial(detail, clients));
  const [clientId, setClientId] = useState(initial.clientId);
  const [title, setTitle] = useState(initial.title);
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  const [items, setItems] = useState(initial.items);
  const [milestones, setMilestones] = useState(initial.milestones);
  const [sections, setSections] = useState(initial.sections);
  const [media, setMedia] = useState(initial.media);
  const [taxOverride, setTaxOverride] = useState<number | null>(null);
  const [taxModal, setTaxModal] = useState<{ open: boolean; label: string; country?: string; candidates: number[] }>({ open: false, label: "Tax", candidates: [] });
  const [taxInput, setTaxInput] = useState("");
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const touch = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  // The AI prefill was applied by the initialiser; consume it so a refresh does not apply it twice.
  useEffect(() => {
    try {
      sessionStorage.removeItem("erp_ai_payload");
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const client = clients.find((c) => c.id === clientId) ?? (detail && detail.clientId === clientId ? { id: detail.clientId, name: detail.clientName, email: detail.clientEmail } : null);
  const clientOptions = client && !clients.some((c) => c.id === client.id) ? [client, ...clients] : clients;

  const format = useCallback((n: number) => formatMoney(n, currency, locale), [currency, locale]);

  /* ── Server-priced totals (same code path as save) ── */
  const validDrafts = useMemo(() => items.filter((i) => i.title.trim() && Number(i.quantity) >= 1 && i.unitPrice !== "" && Number(i.unitPrice) >= 0), [items]);
  const pricedItems = useMemo(
    () =>
      validDrafts.map((i) => ({ serviceTemplateId: i.serviceTemplateId, title: i.title.trim(), quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), isOptional: i.isOptional, isRecurring: i.isRecurring })),
    [validDrafts],
  );
  const gstView = useGstPreview({
    clientId: clientId || null,
    lines: validDrafts.filter((i) => !i.isOptional).map((i) => ({ description: i.title.trim(), amount: Number(i.quantity) * Number(i.unitPrice), quantity: Number(i.quantity), serviceTemplateId: i.serviceTemplateId })),
  });

  const previewBody = useMemo(() => (clientId && pricedItems.length ? { clientId, items: pricedItems, ...(taxOverride !== null ? { taxRateOverride: taxOverride } : {}) } : null), [clientId, pricedItems, taxOverride]);
  const previewKey = previewBody ? JSON.stringify(previewBody) : "";
  const [preview, setPreview] = useState<PreviewState>({ key: "", data: null, error: null });

  useEffect(() => {
    if (!previewBody) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/proposals/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: previewKey, signal: controller.signal });
        const payload = await res.json().catch(() => null);
        if (res.ok) {
          setPreview({ key: previewKey, data: payload as ProposalPreviewDto, error: null });
          return;
        }
        if (payload?.code === "TAX_RATE_REQUIRED") {
          setTaxModal({ open: true, label: payload.taxLabel || "Tax", country: payload.countryCode, candidates: Array.isArray(payload.candidates) ? payload.candidates : [] });
        }
        setPreview({ key: previewKey, data: null, error: typeof payload?.error === "string" ? payload.error : t("previewFailed") });
      } catch (e) {
        if ((e as { name?: string }).name !== "AbortError") setPreview({ key: previewKey, data: null, error: t("previewFailed") });
      }
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [previewBody, previewKey, t]);

  const previewReady = preview.key === previewKey && previewKey !== "";
  const priced = previewReady ? preview.data : null;
  const localSubtotal = pricedItems.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0);
  const total = priced ? Number(priced.totalAmount) : null;
  const pricing = previewKey !== "" && !previewReady;

  /* ── Validation ── */
  const todayStr = dateInput(new Date());
  const filledMilestones = milestones.filter((m) => m.title.trim() || m.amount);
  const milestoneSum = filledMilestones.reduce((a, m) => a + (Number(m.amount) || 0), 0);
  const milestonesOk = filledMilestones.length === 0 || (total !== null && Math.abs(milestoneSum - total) <= 0.01 && filledMilestones.every((m) => m.title.trim()));
  const checks = {
    client: Boolean(clientId),
    title: title.trim().length > 0,
    items: pricedItems.length > 0 && items.every((i) => !(i.title.trim() || i.unitPrice) || (i.title.trim() && i.unitPrice !== "")),
    date: validUntil >= todayStr,
  };
  const canSave = checks.client && checks.title && checks.items && checks.date && milestonesOk && !pricing && !(previewReady && preview.error);

  const save = async (andSend: boolean) => {
    if (!canSave || busy) return;
    setBusy(andSend ? "send" : "draft");
    setError(null);
    const body = {
      clientId,
      title: title.trim(),
      validUntil,
      items: validDrafts.map((i) => ({
        serviceTemplateId: i.serviceTemplateId,
        title: i.title.trim(),
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        isOptional: i.isOptional,
        isRecurring: i.isRecurring,
      })),
      milestones: filledMilestones.map((m) => ({ title: m.title.trim(), amount: Number(m.amount) || 0, dueDate: m.dueDate || null })),
      richSections: sections.filter((s) => s.title.trim()).map((s) => ({ title: s.title.trim(), body: s.body, mediaUrl: s.mediaUrl.trim() })),
      richMedia: media.filter((m) => m.url.trim()).map((m) => ({ type: m.type, url: m.url.trim(), title: m.title.trim() })),
      ...(taxOverride !== null ? { taxRateOverride: taxOverride } : {}),
    };
    try {
      const res = await fetch(proposalId ? `/api/proposals/${proposalId}` : "/api/proposals", {
        method: proposalId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string; code?: string; proposal?: { id: string } } | null;
      if (!res.ok || !payload?.proposal) {
        setError(payload?.error || t("saveFailed"));
        return;
      }
      const id = payload.proposal.id;
      dirtyRef.current = false;
      if (andSend) {
        const sent = await fetch(`/api/proposals/${id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        if (sent.ok) toast.success(t("sent"));
        else {
          const sentPayload = (await sent.json().catch(() => null)) as { error?: string } | null;
          toast.warning(t("savedNotSent", { reason: sentPayload?.error ?? t("saveFailed") }));
        }
      } else {
        toast.success(proposalId ? t("updated") : t("savedDraft"));
      }
      router.push(`/proposals?proposal=${id}`);
    } catch {
      setError(t("saveFailed"));
    } finally {
      setBusy(null);
    }
  };

  const mark = <T,>(setter: (v: T) => void) => (v: T) => {
    touch();
    setter(v);
  };

  const submitLabel = proposalId ? t("saveChanges") : t("saveDraft");
  const sendLabel = detail && detail.status !== "DRAFT" ? t("saveAndResend") : t("saveAndSend");

  const actions = (compact: boolean) => (
    <div className={cn("flex gap-2", compact ? "items-center" : "flex-col")}>
      <Button type="button" variant="outline" size="lg" disabled={!canSave || busy !== null} onClick={() => save(false)} className={cn("h-12 gap-2 rounded-xl font-semibold", !compact && "w-full")}>
        {busy === "draft" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
        {submitLabel}
      </Button>
      <Button type="button" variant="primary-action" size="lg" disabled={!canSave || busy !== null || !client?.email} onClick={() => save(true)} className={cn("h-12 gap-2 rounded-xl font-semibold", !compact && "w-full")} title={!client?.email ? t("needsEmail") : undefined}>
        {busy === "send" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        {compact ? t("send") : sendLabel}
      </Button>
    </div>
  );

  const checklist: Array<[string, boolean]> = [
    [t("check.client"), checks.client],
    [t("check.items"), checks.items],
    [t("check.date"), checks.date],
    [t("check.milestones"), milestonesOk],
  ];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      className="grid gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_22rem] lg:pb-0"
      noValidate
    >
      <div className="min-w-0 space-y-5">
        <ComposerSection step={1} title={t("basics.title")} hint={t("basics.hint")} done={checks.client && checks.title && checks.date}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pc-title">{t("basics.proposalTitle")}</Label>
              <Input id="pc-title" value={title} maxLength={200} onChange={(e) => mark(setTitle)(e.target.value)} placeholder={t("basics.titlePlaceholder")} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-client">{t("basics.client")}</Label>
              <Select value={clientId} onValueChange={mark(setClientId)}>
                <SelectTrigger id="pc-client" className="h-11 w-full">
                  <SelectValue placeholder={t("basics.clientPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {clientOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {client && !client.email && <p className="text-xs text-amber-700 dark:text-amber-400">{t("basics.noEmail")}</p>}
              {clients.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  <Link href="/clients" className="text-indigo-600 hover:underline dark:text-indigo-400">{t("basics.addClient")}</Link>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-valid">{t("basics.validUntil")}</Label>
              <Input id="pc-valid" type="date" min={todayStr} value={validUntil} onChange={(e) => mark(setValidUntil)(e.target.value)} className="h-11" />
              {!checks.date && <p role="alert" className="text-xs text-rose-600">{t("basics.datePast")}</p>}
            </div>
          </div>
        </ComposerSection>

        <ComposerSection step={2} title={t("items.sectionTitle")} hint={t("items.hint")} done={checks.items} delay={0.05}>
          <ItemsEditor items={items} catalog={catalog} catalogLoading={catalogLoading} format={format} onChange={mark(setItems)} />
        </ComposerSection>

        <GstPreviewCard preview={gstView.preview} loading={gstView.loading} format={format} />

        <ComposerSection step={3} title={t("details.title")} hint={t("details.hint")} done={milestonesOk && filledMilestones.length > 0} delay={0.1}>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("milestones.heading")}</h3>
              <MilestonesEditor milestones={milestones} total={total} format={format} onChange={mark(setMilestones)} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("sections.heading")}</h3>
              <SectionsEditor sections={sections} onChange={mark(setSections)} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("media.heading")}</h3>
              <MediaEditor media={media} onChange={mark(setMedia)} />
            </div>
          </div>
        </ComposerSection>

        <ComposerSection step={4} title={t("review.title")} hint={t("review.hint")} delay={0.15}>
          <article className="overflow-hidden rounded-xl border border-border/70 bg-background" aria-label={t("review.title")}>
            <header className="border-b border-border/60 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">{t("review.proposalFor", { client: client?.name ?? "…" })}</p>
              <h3 className="mt-1 text-lg font-bold">{title.trim() || t("review.untitled")}</h3>
              <p className="text-xs text-muted-foreground">{t("review.valid", { date: validUntil || "—" })}</p>
            </header>
            <ul className="divide-y divide-border/60 text-sm">
              {pricedItems.length === 0 && <li className="px-4 py-6 text-center text-muted-foreground">{t("review.noItems")}</li>}
              {pricedItems.map((i, idx) => (
                <li key={idx} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{i.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {i.quantity} × {format(i.unitPrice)}
                      {i.isOptional ? ` · ${t("review.optional")}` : ""}
                      {i.isRecurring ? ` · ${t("review.recurring")}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{format(i.quantity * i.unitPrice)}</span>
                </li>
              ))}
            </ul>
          </article>
        </ComposerSection>
      </div>

      {/* Desktop summary */}
      <aside className="hidden lg:block" aria-label={t("summary.title")}>
        <div className="sticky top-4 space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{t("summary.title")}</h2>
            <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{currency}</span>
          </div>
          <dl className="space-y-1.5 text-sm tabular-nums">
            <div className="flex justify-between"><dt className="text-muted-foreground">{t("summary.subtotal")}</dt><dd>{format(priced ? Number(priced.subtotal) : localSubtotal)}</dd></div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{priced ? t("summary.tax", { label: priced.taxLabel, rate: priced.taxRatePercent }) : t("summary.taxPending")}</dt>
              <dd>{priced ? format(Number(priced.estimatedTax)) : pricing ? <Loader2 className="size-3.5 animate-spin" aria-label={t("summary.pricing")} /> : "—"}</dd>
            </div>
          </dl>
          <div className="border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground">{t("summary.total")}</p>
            <AnimatedMoney value={total ?? localSubtotal} format={format} className="block text-3xl font-black tabular-nums tracking-tight" />
            {taxOverride !== null && <p className="mt-1 text-xs text-muted-foreground">{t("summary.override", { rate: taxOverride })}</p>}
          </div>
          <ul className="space-y-1.5 text-sm" aria-label={t("summary.checklist")}>
            {checklist.map(([label, ok]) => (
              <li key={label} className={cn("flex items-center gap-2", ok ? "text-foreground" : "text-muted-foreground")}>
                <span className={cn("flex size-4 items-center justify-center rounded-full", ok ? "bg-emerald-500 text-white" : "")}>
                  {ok ? <Check className="size-3" aria-hidden /> : <Circle className="size-3" aria-hidden />}
                </span>
                {label}
              </li>
            ))}
          </ul>
          {preview.error && previewReady && <p role="alert" className="text-xs text-rose-600">{preview.error}</p>}
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
          {actions(false)}
          <p className="text-center text-xs text-muted-foreground">{t("summary.note")}</p>
        </div>
      </aside>

      {/* Mobile bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur lg:hidden">
        {error && <p role="alert" className="mx-auto mb-2 max-w-xl text-xs text-rose-600">{error}</p>}
        <div className="mx-auto flex max-w-xl items-center gap-3 pe-16 sm:pe-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t("summary.itemsCount", { count: pricedItems.length })}</p>
            <AnimatedMoney value={total ?? localSubtotal} format={format} className="block truncate text-xl font-bold tabular-nums" />
          </div>
          {actions(true)}
        </div>
      </div>

      <TaxRateModal
        open={taxModal.open}
        onOpenChange={(open) => setTaxModal((m) => ({ ...m, open }))}
        title={t("tax.title")}
        description={t("tax.description")}
        taxLabel={taxModal.label}
        countryCode={taxModal.country}
        candidates={taxModal.candidates}
        value={taxInput}
        onValueChange={setTaxInput}
        onConfirm={() => {
          const rate = Number(taxInput);
          if (!Number.isFinite(rate) || rate < 0 || rate > 100) return;
          touch();
          setTaxOverride(rate);
          setTaxModal((m) => ({ ...m, open: false }));
        }}
      />
    </form>
  );
}
