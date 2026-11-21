"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildUpiUri, normalizeUpiVpa } from "@/lib/invoice/upi";
import { Field, Panel } from "../form-kit";

export type PaymentQr = { id: string; label: string; imageUrl: string };
const MAX_QR = 3;

/** UPI ID, payee name and up to three uploaded static QR images. Both parts are optional. */
export function UpiQrCard({
  vpa,
  payee,
  onVpa,
  onPayee,
  errors,
  qrs,
  canManage,
  onChanged,
}: {
  vpa: string;
  payee: string;
  onVpa: (v: string) => void;
  onPayee: (v: string) => void;
  errors: Record<string, string | undefined>;
  qrs: PaymentQr[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("SettingsHub.banking");
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const valid = normalizeUpiVpa(vpa);
  const uri = valid ? buildUpiUri({ vpa: valid, payeeName: payee.trim() || null }) : null;

  const upload = async (file: File) => {
    setBusy("add");
    try {
      const form = new FormData();
      form.set("label", label);
      form.set("file", file);
      const res = await fetch("/api/settings/payment-qr", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) toast.error(body.error ?? t("qrFailed"));
      else {
        toast.success(t("qrAdded"));
        setLabel("");
        onChanged();
      }
    } catch {
      toast.error(t("qrFailed"));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch("/api/settings/payment-qr", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) toast.error(t("qrFailed"));
      else {
        toast.success(t("qrRemoved"));
        onChanged();
      }
    } catch {
      toast.error(t("qrFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title={t("upiTitle")} description={t("upiHint")}>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("upiId")} hint={t("upiIdHint")} error={errors.upiVpa}>
            {(p) => <Input {...p} value={vpa} maxLength={80} placeholder="yourname@bank" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => onVpa(e.target.value)} disabled={!canManage} className="font-mono" />}
          </Field>
          <Field label={t("upiPayee")} hint={t("upiPayeeHint")} error={errors.upiPayeeName}>
            {(p) => <Input {...p} value={payee} maxLength={80} onChange={(e) => onPayee(e.target.value)} disabled={!canManage} />}
          </Field>
        </div>
        {uri ? (
          <figure className="mx-auto flex flex-col items-center gap-1.5 sm:mx-0">
            <div className="rounded-lg border border-border/70 bg-white p-2"><QRCodeSVG value={uri} size={88} level="M" /></div>
            <figcaption className="text-[11px] text-muted-foreground">{t("upiTest")}</figcaption>
          </figure>
        ) : null}
      </div>

      <div className="mt-6 border-t border-border/60 pt-5">
        <h4 className="text-sm font-semibold">{t("qrTitle")}</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("qrHint")}</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {qrs.map((q) => (
            <li key={q.id} className="flex flex-col items-center gap-2 rounded-xl border border-border/70 p-3">
              <Image src={q.imageUrl} alt={t("qrAlt", { label: q.label })} width={112} height={112} unoptimized className="size-28 rounded-md border border-border/60 bg-white object-contain" />
              <p className="max-w-full truncate text-sm font-medium">{q.label}</p>
              <Button type="button" variant="ghost" size="sm" disabled={!canManage || busy !== null} onClick={() => remove(q.id)} className="h-8 gap-1.5 text-xs text-rose-600 hover:text-rose-700 pointer-coarse:h-11">
                {busy === q.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
                {t("qrRemove")}
              </Button>
            </li>
          ))}
        </ul>
        {qrs.length < MAX_QR && canManage ? (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-full space-y-1 sm:w-48">
              <label htmlFor="qr-label" className="text-xs font-medium text-muted-foreground">{t("qrLabel")}</label>
              <Input id="qr-label" value={label} maxLength={30} placeholder={t("qrLabelPlaceholder")} onChange={(e) => setLabel(e.target.value)} className="h-10 pointer-coarse:h-11" />
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="qr-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            <Button type="button" variant="outline" disabled={!label.trim() || busy !== null} onClick={() => fileRef.current?.click()} className="h-10 gap-2 pointer-coarse:h-11">
              {busy === "add" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
              {t("qrChoose")}
            </Button>
          </div>
        ) : qrs.length >= MAX_QR ? (
          <p className="mt-3 text-xs text-muted-foreground">{t("qrLimit")}</p>
        ) : null}
      </div>
    </Panel>
  );
}
