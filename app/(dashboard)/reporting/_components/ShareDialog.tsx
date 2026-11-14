"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type ViewParams } from "./shared";

/** A frozen, read-only link for someone outside the workspace. It expires, and can be turned off from the Reporting Center home. */
export function ShareDialog({ open, onOpenChange, reportId, params, defaultName }: { open: boolean; onOpenChange: (o: boolean) => void; reportId: string; params: ViewParams; defaultName: string }) {
  const t = useTranslations("ReportingCenter");
  const [name, setName] = useState(defaultName);
  const [days, setDays] = useState("14");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const body = { reportId, name, expiresInDays: Number(days), period: params.period, from: params.from, to: params.to, compare: params.compare, spec: params.spec };
      const r = await api<{ url: string }>("/api/reporting/shares", { method: "POST", body: JSON.stringify(body) });
      setUrl(r.url);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("saveFailed")); } finally { setBusy(false); }
  };
  const copy = async () => { if (!url) return; try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { toast.error(t("copyFailed")); } };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("share.title")}</DialogTitle><DialogDescription>{t("share.hint")}</DialogDescription></DialogHeader>
        {url ? (
          <div className="space-y-3"><p className="text-sm text-muted-foreground">{t("share.ready")}</p><div className="flex gap-2"><Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={t("share.link")} /><Button variant="outline" size="icon" onClick={() => void copy()} aria-label={t("share.copy")}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button></div></div>
        ) : (
          <div className="space-y-4">
            <div><Label htmlFor="sh-name" className="text-xs">{t("viewName")}</Label><Input id="sh-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label className="text-xs">{t("share.expires")}</Label><Select value={days} onValueChange={setDays}><SelectTrigger aria-label={t("share.expires")}><SelectValue /></SelectTrigger><SelectContent>{[1, 7, 14, 30, 90].map((d) => <SelectItem key={d} value={String(d)}>{t("share.days", { count: d })}</SelectItem>)}</SelectContent></Select></div>
            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{t("share.warning")}</p>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{url ? t("done") : t("cancel")}</Button>{url ? null : <Button onClick={() => void create()} disabled={busy}>{t("share.create")}</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
