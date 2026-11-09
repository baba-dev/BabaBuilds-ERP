"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getBustedUrl } from "@/lib/cache-buster";

/** Logo or signature. Uploads and removals take effect at once (they are files, not form text). */
export function ImageField({ kind, url, disabled, onChanged }: { kind: "logo" | "signature"; url: string | null | undefined; disabled?: boolean; onChanged: () => void }) {
  const t = useTranslations("SettingsHub.business");
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(form: FormData) {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/branding", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { toast.error(body.error ?? t("imageFailed")); return; }
      toast.success(t("imageSaved"));
      onChanged();
    } catch { toast.error(t("imageFailed")); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated image route */}
        {url ? <img src={getBustedUrl(url)} alt={t(`${kind}Alt`)} className="max-h-full max-w-full object-contain" /> : <ImagePlus className="size-6 text-muted-foreground" aria-hidden />}
      </div>
      <div className="space-y-1.5">
        <input ref={input} type="file" accept={kind === "logo" ? "image/png,image/jpeg,image/webp" : "image/png,image/webp"} className="sr-only" id={`img-${kind}`} aria-label={t(`${kind}Upload`)} disabled={disabled || busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const form = new FormData(); form.append("kind", kind); form.append("file", f); void send(form); }} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden /> : null}{url ? t("replace") : t("upload")}</Button>
          {url ? <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} className="text-rose-600" onClick={() => { const f = new FormData(); f.append("kind", kind); f.append("remove", "true"); void send(f); }}><Trash2 className="me-1.5 size-4" aria-hidden />{t("remove")}</Button> : null}
        </div>
        <p className="text-xs text-muted-foreground">{t(`${kind}Hint`)}</p>
      </div>
    </div>
  );
}
