"use client";

import { catalogCodeStatus } from "@/lib/gst/source";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { ServiceItem } from "./service-types";

type TaxCodes = {
  nic: Array<{ id: string; code: string; description: string }>;
  sac: Array<{ id: string; code: string; description: string; igstRate: number }>;
};

type FormState = { name: string; description: string; longDescription: string; defaultPrice: string; nicCodeId: string; sacCodeId: string; imageUrl: string };
const EMPTY: FormState = { name: "", description: "", longDescription: "", defaultPrice: "", nicCodeId: "", sacCodeId: "", imageUrl: "" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const NONE = "__none__";

type Props = {
  open: boolean;
  service: ServiceItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (service: ServiceItem) => void;
};

let taxCodeCache: TaxCodes | null = null;

export function ServiceForm({ open, service, onOpenChange, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-2xl sm:border">
        {/* Mounted only while open: every open starts from a clean form without a reset effect. */}
        <ServiceFormBody key={service?.id ?? "new"} service={service} onClose={() => onOpenChange(false)} onSaved={onSaved} onBusy={setBusy} />
      </DialogContent>
    </Dialog>
  );
}

function ServiceFormBody({ service, onClose, onSaved, onBusy }: { service: ServiceItem | null; onClose: () => void; onSaved: (service: ServiceItem) => void; onBusy: (busy: boolean) => void }) {
  const t = useTranslations("ServiceCatalog.form");
  const { currency, locale, taxLabel, countryCode = "Global", fCurrency } = useFormat();
  const symbol = getCurrencySymbol(currency, locale);
  const industryLabel = countryCode === "IN" ? t("industryIn") : t("industry");
  const taxClassLabel = countryCode === "IN" ? t("taxClassIn") : t("taxClass");

  const [taxCodes, setTaxCodes] = useState<TaxCodes>(taxCodeCache ?? { nic: [], sac: [] });
  const [form, setForm] = useState<FormState>(() =>
    service
      ? {
          name: service.name,
          description: service.description ?? "",
          longDescription: service.longDescription ?? "",
          defaultPrice: String(service.defaultPrice),
          nicCodeId: service.nicCode?.id ?? "",
          sacCodeId: service.sacCode?.id ?? "",
          imageUrl: service.imageUrl ?? "",
        }
      : EMPTY,
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | "image" | "form", string>>>({});
  const [submitting, setSubmitting] = useState(false);

  // Tax code lists are fetched once per session and cached.
  useEffect(() => {
    if (taxCodeCache) return;
    fetch("/api/tax-codes")
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          taxCodeCache = data;
          setTaxCodes(data);
        }
      })
      .catch(() => toast.error(t("taxCodesFailed")));
  }, [t]);

  const imagePreview = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : null), [imageFile]);
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  };

  const pickImage = (file: File | null) => {
    if (file && file.size > MAX_IMAGE_BYTES) {
      setErrors((e) => ({ ...e, image: t("imageTooLarge") }));
      return;
    }
    setErrors((e) => ({ ...e, image: undefined }));
    setImageFile(file);
  };

  const validate = () => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = t("nameRequired");
    const price = Number(form.defaultPrice);
    if (form.defaultPrice === "" || !Number.isFinite(price) || price < 0) next.defaultPrice = t("priceInvalid");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !validate()) return;
    setSubmitting(true);
    onBusy(true);
    try {
      const fd = new FormData();
      fd.append("name", form.name.trim());
      fd.append("description", form.description);
      fd.append("longDescription", form.longDescription);
      fd.append("defaultPrice", form.defaultPrice);
      fd.append("nicCodeId", form.nicCodeId);
      fd.append("sacCodeId", form.sacCodeId);
      if (imageFile) fd.append("serviceImage", imageFile);
      if (service) fd.append("existingImageUrl", form.imageUrl);

      const res = await fetch(service ? `/api/services/${service.id}` : "/api/services", { method: service ? "PATCH" : "POST", body: fd });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; code?: string; service?: ServiceItem };
      if (!res.ok || !payload.service) {
        if (payload.code === "DUPLICATE_NAME") setErrors({ name: payload.error ?? t("duplicateName") });
        else setErrors({ form: payload.error ?? t("saveFailed") });
        return;
      }
      toast.success(service ? t("updated") : t("created"));
      onSaved(payload.service);
      onClose();
    } catch {
      setErrors({ form: t("networkError") });
    } finally {
      setSubmitting(false);
      onBusy(false);
    }
  };

  const shownImage = imagePreview ?? (form.imageUrl || null);

  return (
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b border-border/70 bg-muted/30 px-5 py-4 text-start sm:px-6">
            <DialogTitle className="text-lg font-semibold">{service ? t("editTitle") : t("addTitle")}</DialogTitle>
            <DialogDescription>{service ? t("editDescription") : t("addDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-5 py-5 sm:px-6 lg:grid-cols-[1fr_16rem]">
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
                <div className="space-y-1.5">
                  <div className="flex items-end justify-between">
                    <Label htmlFor="svc-name">{t("name")}</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">{form.name.length}/120</span>
                  </div>
                  <Input id="svc-name" value={form.name} maxLength={120} autoFocus placeholder={t("namePlaceholder")} onChange={(e) => set("name", e.target.value)} aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? "svc-name-error" : undefined} className="h-11" />
                  {errors.name && <p id="svc-name-error" className="text-xs font-medium text-rose-600 dark:text-rose-400">{errors.name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="svc-price">{t("price")}</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">{symbol}</span>
                    <Input id="svc-price" type="number" inputMode="decimal" min="0" step="0.01" value={form.defaultPrice} placeholder="0.00" onChange={(e) => set("defaultPrice", e.target.value)} aria-invalid={errors.defaultPrice ? true : undefined} className="h-11 ps-8 font-semibold tabular-nums" />
                  </div>
                  {errors.defaultPrice && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{errors.defaultPrice}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-end justify-between">
                  <Label htmlFor="svc-desc">{t("shortDescription")}</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{form.description.length}/200</span>
                </div>
                <Input id="svc-desc" value={form.description} maxLength={200} placeholder={t("shortDescriptionPlaceholder")} onChange={(e) => set("description", e.target.value)} className="h-11" />
                <p className="text-xs text-muted-foreground">{t("shortDescriptionHint")}</p>
              </div>

              <div className="space-y-1.5">
                <Label>{t("longDescription")}</Label>
                <RichTextEditor value={form.longDescription} onChange={(html) => set("longDescription", html)} placeholder={t("longDescriptionPlaceholder")} />
              </div>

              <fieldset className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
                  <ShieldCheck className="size-4 text-emerald-600" aria-hidden /> {t("taxTitle")}
                </legend>
                <p className="-mt-2 text-xs text-muted-foreground">{t("taxHint", { taxLabel })}</p>
                <div className="space-y-1.5">
                  <Label>{taxClassLabel}</Label>
                  <Select value={form.sacCodeId || NONE} onValueChange={(v) => set("sacCodeId", v === NONE ? "" : v)}>
                    <SelectTrigger className="h-auto min-h-11 w-full py-2 text-start"><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={NONE}>{t("none")}</SelectItem>
                      {taxCodes.sac.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="font-semibold">{c.code}</span> — {c.description} ({c.igstRate}% {taxLabel})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(() => {
                    const picked = taxCodes.sac.find((c) => c.id === form.sacCodeId);
                    if (!picked) return null;
                    const status = catalogCodeStatus(picked.code, picked.igstRate);
                    if (!status.check.valid) return <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{t("codeInvalidHint")}</p>;
                    if (status.rateStatus === "LEGACY") return <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-300">{t("rateStaleHint", { rate: picked.igstRate })}</p>;
                    return null;
                  })()}
                </div>
                <div className="space-y-1.5">
                  <Label>{industryLabel}</Label>
                  <Select value={form.nicCodeId || NONE} onValueChange={(v) => set("nicCodeId", v === NONE ? "" : v)}>
                    <SelectTrigger className="h-auto min-h-11 w-full py-2 text-start"><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={NONE}>{t("none")}</SelectItem>
                      {taxCodes.nic.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="font-semibold">{c.code}</span> — {c.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </fieldset>
            </div>

            {/* Side column: image + live preview */}
            <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
              <div className="space-y-1.5">
                <Label>{t("image")}</Label>
                <div className="relative overflow-hidden rounded-xl border border-dashed border-border bg-muted/30">
                  {shownImage ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- local preview or private upload URL */}
                      <img src={shownImage} alt="" className="h-36 w-full object-cover" />
                      <button type="button" onClick={() => { setImageFile(null); set("imageUrl", ""); }} aria-label={t("removeImage")} className="absolute end-2 top-2 rounded-full bg-background/90 p-1.5 shadow hover:bg-background">
                        <X className="size-4" aria-hidden />
                      </button>
                    </>
                  ) : (
                    <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-within:ring-2 focus-within:ring-ring">
                      <ImagePlus className="size-6" aria-hidden />
                      {t("uploadImage")}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
                    </label>
                  )}
                </div>
                {shownImage && (
                  <label className="inline-flex cursor-pointer text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                    {t("replaceImage")}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
                  </label>
                )}
                <p className="text-xs text-muted-foreground">{t("imageHint")}</p>
                {errors.image && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{errors.image}</p>}
              </div>

              <div className="hidden space-y-1.5 lg:block" aria-hidden>
                <p className="text-xs font-medium text-muted-foreground">{t("preview")}</p>
                <div className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
                  <p className={cn("line-clamp-1 text-sm font-semibold", !form.name && "text-muted-foreground")}>{form.name || t("namePlaceholder")}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{form.description || t("shortDescriptionPlaceholder")}</p>
                  <p className="mt-2 text-base font-bold tabular-nums">{fCurrency(Number(form.defaultPrice) || 0)}</p>
                </div>
              </div>
            </aside>
          </div>

          {errors.form && (
            <p role="alert" className="mx-5 mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 sm:mx-6">
              {errors.form}
            </p>
          )}
          <DialogFooter className="flex-row justify-end gap-2 border-t border-border/70 bg-muted/30 px-5 py-3 sm:px-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary-action" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {service ? t("save") : t("add")}
            </Button>
          </DialogFooter>
        </form>
  );
}
