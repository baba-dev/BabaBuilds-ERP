"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, Info } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { AccentColorField } from "@/components/invoice/AccentColorField";
import { INVOICE_DESIGN_CATALOG, isInvoiceDesignId } from "@/lib/invoice-templates/catalog";
import { normalizeTdsSection } from "@/lib/invoice/tds";
import { useSettingsData } from "../../_components/settings-data";
import { DesignTile } from "./DesignTile";
import { DesignViewer } from "./DesignViewer";
import { previewUrl } from "./pdf-render";

type Meta = { invoice: { id: string; number: string; clientName: string; date: string } | null };

/** Debounce a value so dragging the colour picker or typing a rate does not re-render eight PDFs per keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

export function DesignCompare() {
  const t = useTranslations("InvoiceCompare");
  const th = useTranslations("SettingsHub.invoicing");
  const format = useFormatter();
  const { data, reload } = useSettingsData();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [accent, setAccent] = useState<string | null>(null);
  const [tdsOn, setTdsOn] = useState(false);
  const [rate, setRate] = useState("10");
  const [section, setSection] = useState("194J");
  const [open, setOpen] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/invoice-designs/meta", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((m: Meta | null) => { if (live) setMeta(m ?? { invoice: null }); }).catch(() => { if (live) setMeta({ invoice: null }); });
    return () => { live = false; };
  }, []);

  const rateNum = Number(rate);
  const tds = useMemo(() => (tdsOn && rateNum > 0 && rateNum <= 30 ? { rate: rateNum, section: normalizeTdsSection(section) ?? "194J" } : null), [tdsOn, rateNum, section]);
  // Debounce a plain string so a new object each render cannot restart the timer (or the tile requests).
  const settledKey = useDebounced(JSON.stringify({ accent, tds }), 400);
  const settled = useMemo(() => JSON.parse(settledKey) as { accent: string | null; tds: { rate: number; section: string } | null }, [settledKey]);
  const selected = isInvoiceDesignId(data?.invoiceTheme) ? data?.invoiceTheme : "DESIGN_1";
  const canManage = data?.canManage !== false;
  const invoiceId = meta?.invoice?.id ?? null;
  const urlFor = useCallback((design: string, download = false) => previewUrl({ design, invoiceId, accent: settled.accent, tds: settled.tds, download }), [invoiceId, settled]);

  const chooseDesign = useCallback(async (design: string) => {
    if (!data) return;
    setSaving(true);
    try {
      const values = { invoiceTheme: design, invoiceAccentColor: accent ?? data.invoiceAccentColor ?? null, invoicePrefix: data.invoicePrefix ?? "INV", invoiceTermsDays: data.invoiceTermsDays ?? 7 };
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section: "invoicing", values }) });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(t("saved", { design: th(`design.${design}`) }));
      reload();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [data, accent, reload, t, th]);

  const designs = INVOICE_DESIGN_CATALOG;
  const step = (d: number) => setOpen((i) => (i === null ? i : (i + d + designs.length) % designs.length));

  return (
    <div className="space-y-5 pb-safe">
      <div className="space-y-3">
        <Link href="/settings?section=invoicing" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t("back")}</Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {meta === null ? <Skeleton className="h-6 w-64" /> : meta.invoice ? (
          <p className="text-sm"><span className="text-muted-foreground">{t("showing")} </span><span className="font-medium">{meta.invoice.number}</span> · {meta.invoice.clientName} · <span className="text-muted-foreground">{format.dateTime(new Date(meta.invoice.date), { dateStyle: "medium" })}</span></p>
        ) : (
          <p className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"><Info className="mt-0.5 size-4 shrink-0" aria-hidden /><span><strong className="font-semibold">{t("sampleBadge")}</strong> {t("sampleHint")}</span></p>
        )}
        {meta?.invoice && sample ? <p className="text-xs text-muted-foreground">{t("sampleHint")}</p> : null}
      </div>

      <section aria-label={t("controls")} className="grid gap-5 rounded-2xl border border-border/70 bg-card p-4 sm:p-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-2">
          <AccentColorField label={t("accent")} hint={t("accentHint")} value={accent} onChange={setAccent} inheritedFrom={{ source: "workspace", hex: data?.invoiceAccentColor ?? null }} />
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-sm font-medium" id="compare-tds-label">{t("showTds")}</p><p className="text-xs text-muted-foreground">{t("tdsHint")}</p></div>
            <Switch checked={tdsOn} onCheckedChange={setTdsOn} aria-labelledby="compare-tds-label" />
          </div>
          {tdsOn ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-xs font-medium">{t("tdsSection")}<Input value={section} maxLength={8} onChange={(e) => setSection(e.target.value.toUpperCase())} className="h-10 font-mono pointer-coarse:h-11" /></label>
              <label className="space-y-1.5 text-xs font-medium">{t("tdsRate")}<Input value={rate} inputMode="decimal" maxLength={5} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))} className="h-10 pointer-coarse:h-11" aria-invalid={tdsOn && !tds} /></label>
            </div>
          ) : null}
        </div>
      </section>

      {meta === null ? null : <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-label={t("designs")}>
        {designs.map((d, i) => (
          <li key={d.id} className="min-w-0">
            <DesignTile design={d.id} url={urlFor(d.id)} thin={d.paperSize !== "A4"} current={d.id === selected} onOpen={() => setOpen(i)} onSample={setSample} />
          </li>
        ))}
      </ul>}

      {open !== null ? (
        <DesignViewer design={designs[open].id} index={open} total={designs.length} url={urlFor(designs[open].id)} downloadUrl={urlFor(designs[open].id, true)}
          thin={designs[open].paperSize !== "A4"} current={designs[open].id === selected} canManage={canManage} saving={saving}
          onPrev={() => step(-1)} onNext={() => step(1)} onUse={() => void chooseDesign(designs[open].id)} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}
