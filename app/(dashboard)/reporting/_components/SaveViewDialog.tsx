"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api, type ViewRow } from "./shared";

type Params = { period?: string; from?: string | null; to?: string | null; compare?: boolean };

/** Save the report with its current filters, and optionally email it every week or month. */
export function SaveViewDialog({ open, onOpenChange, reportId, params, existing, defaultName, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; reportId: string; params: Params; existing: ViewRow | null; defaultName: string; onSaved: (v: ViewRow) => void }) {
  const t = useTranslations("ReportingCenter");
  const [name, setName] = useState(existing?.name ?? defaultName);
  const [freq, setFreq] = useState<string>(existing?.scheduleFrequency ?? "NONE");
  const [recipients, setRecipients] = useState(existing?.scheduleRecipients ?? "");
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { name, params, pinned, scheduleFrequency: freq === "NONE" ? null : freq, scheduleRecipients: freq === "NONE" ? null : recipients };
      const res = existing
        ? await api<{ view: ViewRow }>(`/api/reporting/views/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await api<{ view: ViewRow }>("/api/reporting/views", { method: "POST", body: JSON.stringify({ ...body, reportId }) });
      toast.success(t("savedToast")); onSaved(res.view); onOpenChange(false);
    } catch (e) { setErr(e instanceof Error ? e.message : t("saveFailed")); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{existing ? t("updateView") : t("saveView")}</DialogTitle><DialogDescription>{t("saveViewHint")}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div><Label htmlFor="rv-name" className="text-xs">{t("viewName")}</Label><Input id="rv-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
          <label className="flex items-center justify-between gap-3 text-sm"><span>{t("pinToTop")}</span><Switch checked={pinned} onCheckedChange={setPinned} /></label>
          <div>
            <Label className="text-xs">{t("emailIt")}</Label>
            <Select value={freq} onValueChange={setFreq}><SelectTrigger aria-label={t("emailIt")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">{t("freq.NONE")}</SelectItem><SelectItem value="WEEKLY">{t("freq.WEEKLY")}</SelectItem><SelectItem value="MONTHLY">{t("freq.MONTHLY")}</SelectItem></SelectContent></Select>
          </div>
          {freq !== "NONE" ? <div><Label htmlFor="rv-to" className="text-xs">{t("recipients")}</Label><Input id="rv-to" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="name@company.com, finance@company.com" /><p className="mt-1 text-[11px] text-muted-foreground">{t("recipientsHint")}</p></div> : null}
          {err ? <p className="text-sm text-rose-600">{err}</p> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button><Button onClick={() => void save()} disabled={busy || !name.trim()}>{t("save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
