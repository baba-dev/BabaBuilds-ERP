"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { COUNTRY_CODES, countryName, matchCountry } from "@/lib/clients/country";
import { GST_STATES } from "@/lib/gst/states";
import { validateGstin } from "@/lib/gst/gstin";
import { api, type ApiFail, type ClientRowData } from "./shared";

type Form = {
  name: string; email: string; phone: string; website: string; industry: string; country: string; address: string; taxId: string;
  gstStateCode: string; gstSupplyOverride: string; gstReverseCharge: boolean; currency: string; paymentTermsDays: string; creditLimit: string;
  tags: string; status: string; taxTreatment: "auto" | "export" | "domestic";
};

const EMPTY: Form = { name: "", email: "", phone: "", website: "", industry: "", country: "", address: "", taxId: "", gstStateCode: "", gstSupplyOverride: "", gstReverseCharge: false, currency: "", paymentTermsDays: "", creditLimit: "", tags: "", status: "ACTIVE", taxTreatment: "auto" };

const fieldClass = "h-10";
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function fromClient(c: ClientRowData): Form {
  return {
    name: c.name, email: c.email ?? "", phone: c.phone ?? "", website: c.website ?? "", industry: c.industry ?? "", country: c.countryCode ?? c.country, address: c.address,
    taxId: c.taxId ?? "", gstStateCode: c.gstStateCode ?? "", gstSupplyOverride: c.gstSupplyOverride ?? "", gstReverseCharge: Boolean(c.gstReverseCharge),
    currency: c.currency ?? "", paymentTermsDays: c.paymentTermsDays === null ? "" : String(c.paymentTermsDays), creditLimit: c.creditLimit === null ? "" : String(c.creditLimit),
    tags: c.tagList.join(", "), status: c.status, taxTreatment: "auto",
  };
}

export function ClientFormDialog({ open, onOpenChange, client, workspaceCountry, locale, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; client: ClientRowData | null; workspaceCountry: string; locale: string; onSaved: (id: string) => void;
}) {
  const t = useTranslations("ClientsCrm");
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [suggestion, setSuggestion] = useState<ApiFail["suggestion"]>();
  const [duplicates, setDuplicates] = useState<NonNullable<ApiFail["existing"]>>([]);
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState<{ state: "idle" | "busy" | "ok" | "warn" | "off"; text?: string }>({ state: "idle" });
  const [logo, setLogo] = useState<File | null>(null);
  const [gspOn, setGspOn] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const isEdit = Boolean(client);

  useEffect(() => {
    if (!open) return;
    setForm(client ? fromClient(client) : EMPTY);
    setErrors({}); setSuggestion(undefined); setDuplicates([]); setLogo(null); setVerify({ state: "idle" });
    api<{ configured?: boolean }>("/api/gst/gstin-lookup").then((r) => setGspOn(Boolean(r.data.configured)));
    setTimeout(() => firstRef.current?.focus(), 80);
  }, [open, client]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; }); };
  const regions = useMemo(() => {
    const dn = new Intl.DisplayNames([locale], { type: "region" });
    return COUNTRY_CODES.map((c) => ({ code: c, name: dn.of(c) ?? countryName(c) ?? c })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);

  const match = useMemo(() => (form.country.trim() ? matchCountry(form.country) : null), [form.country]);
  const resolvedCode = match && match.exact ? match.code : null;
  const domesticIndia = (resolvedCode ?? "").toUpperCase() === "IN";
  const foreign = resolvedCode ? resolvedCode.toUpperCase() !== workspaceCountry.toUpperCase() : null;
  const gstinCheck = form.taxId.trim() && domesticIndia ? validateGstin(form.taxId) : null;

  const msg = (field: string) => errors[field];
  const err = (_field: string, code: string) => (t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.INVALID"));

  async function checkGstin() {
    setVerify({ state: "busy" });
    const r = await api<{ registration?: { legalName: string | null; tradeName: string | null; status: string; address: string | null } }>("/api/gst/gstin-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gstin: form.taxId }) });
    if (r.status === 501) return setVerify({ state: "off", text: t("form.verifyOff") });
    if (!r.ok || !r.data.registration) return setVerify({ state: "warn", text: r.data.error ?? t("form.verifyFailed") });
    const reg = r.data.registration;
    const legal = reg.legalName || reg.tradeName || "";
    setForm((f) => ({ ...f, name: f.name || legal, address: f.address || reg.address || "" }));
    setVerify({ state: reg.status === "ACTIVE" ? "ok" : "warn", text: `${legal} · ${reg.status}` });
  }

  async function submit(force = false) {
    setBusy(true); setErrors({}); setSuggestion(undefined); setDuplicates([]);
    const payload: Record<string, unknown> = {
      name: form.name, email: form.email, phone: form.phone, website: form.website, industry: form.industry, country: form.country, address: form.address, taxId: form.taxId,
      currency: form.currency, paymentTermsDays: form.paymentTermsDays, creditLimit: form.creditLimit, tags: form.tags, status: form.status,
      gstStateCode: form.gstStateCode, gstSupplyOverride: form.gstSupplyOverride, gstReverseCharge: form.gstReverseCharge,
    };
    if (form.taxTreatment !== "auto") payload.isExport = form.taxTreatment === "export";
    if (force) payload.force = true;
    let init: RequestInit;
    if (logo) {
      const fd = new FormData();
      Object.entries(payload).forEach(([k, v]) => fd.append(k, String(v)));
      fd.append("logo", logo);
      init = { method: isEdit ? "PATCH" : "POST", body: fd };
    } else init = { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
    const r = await api<{ client?: { id: string } }>(isEdit ? `/api/clients/${client!.id}` : "/api/clients", init);
    setBusy(false);
    if (r.ok && r.data.client) { toast.success(isEdit ? t("toast.updated") : t("toast.created")); onOpenChange(false); onSaved(r.data.client.id); return; }
    if (r.data.code === "VALIDATION" && r.data.fields) {
      const map: Record<string, string> = {};
      for (const f of r.data.fields) map[f.field] = err(f.field, f.code);
      setErrors(map); setSuggestion(r.data.suggestion);
      toast.error(t("toast.fixFields"));
      return;
    }
    if (r.data.code === "CLIENT_DUPLICATE") { setDuplicates(r.data.existing ?? []); return; }
    if (r.data.code === "CLIENT_NAME_TAKEN") { setErrors({ name: t("errors.NAME_TAKEN") }); return; }
    if (r.data.code === "PLAN_LIMIT" || r.data.code === "CLIENT_LIMIT_REACHED") { toast.error(r.data.error ?? t("toast.failed")); return; }
    toast.error(r.data.error ?? t("toast.failed"));
  }

  const L = ({ id, children, hint }: { id: string; children: React.ReactNode; hint?: string }) => (
    <div className="space-y-1"><Label htmlFor={id} className="text-xs font-medium text-muted-foreground">{children}</Label>{hint ? <span className="sr-only">{hint}</span> : null}</div>
  );
  const Err = ({ k }: { k: string }) => (msg(k) ? <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">{msg(k)}</p> : null);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t("form.editTitle") : t("form.newTitle")}
      description={t("form.description")}
      desktopClassName="sm:max-w-2xl max-h-[90dvh] overflow-y-auto"
      footer={undefined}
    >
      <form onSubmit={(e) => { e.preventDefault(); void submit(false); }} className="space-y-6" noValidate>
        {duplicates.length > 0 && (
          <div role="alert" className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <div className="space-y-2">
              <p className="font-medium">{t("form.duplicateTitle", { name: duplicates[0]?.name ?? "" })}</p>
              <div className="flex flex-wrap gap-2">
                {duplicates.map((d) => (<a key={d.id} href={`/clients/${d.id}`} className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted">{d.name}</a>))}
                <Button type="button" size="sm" variant="outline" onClick={() => void submit(true)} disabled={busy}>{t("form.createAnyway")}</Button>
              </div>
            </div>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2" aria-label={t("form.basics")}>
          <div className="sm:col-span-2">
            <L id="cf-name">{t("form.name")} *</L>
            <Input id="cf-name" ref={firstRef} className={fieldClass} value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={Boolean(msg("name"))} autoComplete="organization" maxLength={160} />
            <Err k="name" />
          </div>
          <div>
            <L id="cf-email">{t("form.email")}</L>
            <Input id="cf-email" type="email" className={fieldClass} value={form.email} onChange={(e) => set("email", e.target.value)} aria-invalid={Boolean(msg("email"))} autoComplete="off" />
            <Err k="email" />
          </div>
          <div>
            <L id="cf-phone">{t("form.phone")}</L>
            <Input id="cf-phone" type="tel" className={fieldClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={Boolean(msg("phone"))} />
            <Err k="phone" />
          </div>
          <div>
            <L id="cf-web">{t("form.website")}</L>
            <Input id="cf-web" className={fieldClass} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="example.com" aria-invalid={Boolean(msg("website"))} />
            <Err k="website" />
          </div>
          <div>
            <L id="cf-industry">{t("form.industry")}</L>
            <Input id="cf-industry" className={fieldClass} value={form.industry} onChange={(e) => set("industry", e.target.value)} />
            <Err k="industry" />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2" aria-label={t("form.location")}>
          <div>
            <L id="cf-country">{t("form.country")} *</L>
            <select id="cf-country" className={selectClass} value={resolvedCode ? resolvedCode.toUpperCase() : form.country} onChange={(e) => set("country", e.target.value)} aria-invalid={Boolean(msg("country"))}>
              <option value="">{t("form.selectCountry")}</option>
              {form.country && !resolvedCode && <option value={form.country}>{form.country}</option>}
              {regions.map((r) => (<option key={r.code} value={r.code}>{r.name}</option>))}
            </select>
            <Err k="country" />
            {suggestion?.field === "country" && (
              <button type="button" className="mt-1 text-xs text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400" onClick={() => { set("country", suggestion.code); setSuggestion(undefined); setErrors({}); }}>
                {t("form.didYouMean", { name: suggestion.name })}
              </button>
            )}
          </div>
          <div>
            <L id="cf-tax">{domesticIndia ? "GSTIN" : t("form.taxId")}</L>
            <div className="flex gap-2">
              <Input id="cf-tax" className={`${fieldClass} font-mono uppercase placeholder:normal-case`} value={form.taxId} onChange={(e) => { set("taxId", e.target.value.toUpperCase()); setVerify({ state: "idle" }); }} aria-invalid={Boolean(msg("taxId"))} maxLength={30} />
              {domesticIndia && (
                <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => void checkGstin()} disabled={!gstinCheck?.valid || verify.state === "busy" || !gspOn} title={gspOn ? undefined : t("form.verifyOff")}>
                  {verify.state === "busy" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}<span className="ml-1.5">{t("form.verify")}</span>
                </Button>
              )}
            </div>
            <Err k="taxId" />
            {gstinCheck && !gstinCheck.valid && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t("errors.GSTIN_INVALID")}</p>}
            {verify.text && <p className={`mt-1 text-xs ${verify.state === "ok" ? "text-emerald-600" : "text-amber-700 dark:text-amber-400"}`} role="status">{verify.text}</p>}
          </div>
          <div className="sm:col-span-2">
            <L id="cf-address">{t("form.address")} *</L>
            <Textarea id="cf-address" rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} aria-invalid={Boolean(msg("address"))} maxLength={400} />
            <Err k="address" />
          </div>
          {domesticIndia && (
            <>
              <div>
                <L id="cf-state">{t("form.gstState")}</L>
                <select id="cf-state" className={selectClass} value={form.gstStateCode} onChange={(e) => set("gstStateCode", e.target.value)}>
                  <option value="">{t("form.autoFromGstin")}</option>
                  {GST_STATES.map((s) => (<option key={s.code} value={s.code}>{s.code} · {s.name}</option>))}
                </select>
              </div>
              <div>
                <L id="cf-sez">{t("form.supplyType")}</L>
                <select id="cf-sez" className={selectClass} value={form.gstSupplyOverride} onChange={(e) => set("gstSupplyOverride", e.target.value)}>
                  <option value="">{t("form.regular")}</option>
                  <option value="SEZ_WP">{t("form.sezWith")}</option>
                  <option value="SEZ_WOP">{t("form.sezWithout")}</option>
                </select>
                <Err k="gstSupplyOverride" />
              </div>
            </>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2" aria-label={t("form.billing")}>
          <div>
            <L id="cf-treatment">{t("form.taxTreatment")}</L>
            <select id="cf-treatment" className={selectClass} value={form.taxTreatment} onChange={(e) => set("taxTreatment", e.target.value as Form["taxTreatment"])}>
              <option value="auto">{foreign === null ? t("form.treatmentAuto") : foreign ? t("form.treatmentAutoExport") : t("form.treatmentAutoDomestic")}</option>
              <option value="export">{t("form.treatmentExport")}</option>
              <option value="domestic">{t("form.treatmentDomestic")}</option>
            </select>
          </div>
          <div>
            <L id="cf-status">{t("form.status")}</L>
            <select id="cf-status" className={selectClass} value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="ACTIVE">{t("status.ACTIVE")}</option>
              <option value="VIP">{t("status.VIP")}</option>
              <option value="INACTIVE">{t("status.INACTIVE")}</option>
            </select>
          </div>
          <div>
            <L id="cf-terms">{t("form.terms")}</L>
            <Input id="cf-terms" inputMode="numeric" className={fieldClass} value={form.paymentTermsDays} onChange={(e) => set("paymentTermsDays", e.target.value.replace(/[^\d]/g, ""))} placeholder={t("form.termsDefault")} aria-invalid={Boolean(msg("paymentTermsDays"))} />
            <Err k="paymentTermsDays" />
          </div>
          <div>
            <L id="cf-currency">{t("form.currency")}</L>
            <Input id="cf-currency" className={`${fieldClass} uppercase placeholder:normal-case`} value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase().slice(0, 3))} placeholder={t("form.currencyDefault")} aria-invalid={Boolean(msg("currency"))} />
            <Err k="currency" />
          </div>
          <div>
            <L id="cf-credit">{t("form.creditLimit")}</L>
            <Input id="cf-credit" inputMode="decimal" className={fieldClass} value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value.replace(/[^\d.]/g, ""))} placeholder={t("form.noLimit")} aria-invalid={Boolean(msg("creditLimit"))} />
            <Err k="creditLimit" />
          </div>
          <div>
            <L id="cf-tags">{t("form.tags")}</L>
            <Input id="cf-tags" className={fieldClass} value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder={t("form.tagsHint")} />
          </div>
          <div className="sm:col-span-2">
            <L id="cf-logo">{t("form.logo")}</L>
            <Input id="cf-logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="h-10 py-1.5" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          </div>
        </section>

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{t("form.cancel")}</Button>
          <Button type="submit" disabled={busy || !form.name.trim()}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}{isEdit ? t("form.save") : t("form.create")}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
