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
import { api, type ViewParams, type ViewRow } from "./shared";

type Params = ViewParams;

/** Save the report with its current filters, and optionally email it every week or month. */
export function SaveViewDialog({ open, onOpenChange, reportId, params, existing, defaultName, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; reportId: string; params: Params; existing: ViewRow | null; defaultName: string; onSaved: (v: ViewRow) => void }) {
  const t = useTranslations("ReportingCenter");
  const [name, setName] = useState(existing?.name ?? defaultName);
  const [freq, setFreq] = useState<string>(existing?.scheduleFrequency ?? "NONE");
  const [recipients, setRecipients] = useState(existing?.scheduleRecipients ?? "");
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [dash, setDash] = useState(existing?.pinnedToDashboard ?? false);
  const [priv, setPriv] = useState((existing?.visibility ?? "WORKSPACE") === "PRIVATE");
  const [fmtSel, setFmtSel] = useState<string>(existing?.scheduleFormat ?? "CSV");
  const [hour, setHour] = useState(String(existing?.scheduleHour ?? 7));
  const [tz, setTz] = useState(existing?.scheduleTz ?? (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"));
  const [enabled, setEnabled] = useState(existing?.scheduleEnabled ?? true);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { name, params, pinned, pinnedToDashboard: dash, visibility: priv ? "PRIVATE" : "WORKSPACE", scheduleFrequency: freq === "NONE" ? null : freq, scheduleRecipients: freq === "NONE" ? null : recipients, ...(freq === "NONE" ? {} : { scheduleFormat: fmtSel, scheduleHour: Number(hour), scheduleTz: tz, scheduleEnabled: enabled }) };
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
          <label className="flex items-center justify-between gap-3 text-sm"><span>{t("pinToDashboard")}</span><Switch checked={dash} onCheckedChange={setDash} /></label>
          <label className="flex items-center justify-between gap-3 text-sm"><span>{t("onlyMe")}</span><Switch checked={priv} onCheckedChange={setPriv} /></label>
          <div>
            <Label className="text-xs">{t("emailIt")}</Label>
            <Select value={freq} onValueChange={setFreq}><SelectTrigger aria-label={t("emailIt")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">{t("freq.NONE")}</SelectItem><SelectItem value="WEEKLY">{t("freq.WEEKLY")}</SelectItem><SelectItem value="MONTHLY">{t("freq.MONTHLY")}</SelectItem></SelectContent></Select>
          </div>
          {freq !== "NONE" ? (
            <>
              <div><Label htmlFor="rv-to" className="text-xs">{t("recipients")}</Label><Input id="rv-to" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="name@company.com, finance@company.com" /><p className="mt-1 text-[11px] text-muted-foreground">{t("recipientsHint")}</p></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">{t("sendFormat")}</Label><Select value={fmtSel} onValueChange={setFmtSel}><SelectTrigger aria-label={t("sendFormat")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CSV">CSV</SelectItem><SelectItem value="PDF">PDF</SelectItem><SelectItem value="BOTH">CSV + PDF</SelectItem></SelectContent></Select></div>
                <div><Label className="text-xs">{t("sendAt")}</Label><Select value={hour} onValueChange={setHour}><SelectTrigger aria-label={t("sendAt")}><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{`${String(h).padStart(2, "0")}:00`}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div><Label htmlFor="rv-tz" className="text-xs">{t("timeZone")}</Label><Input id="rv-tz" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Asia/Kolkata" /></div>
              <label className="flex items-center justify-between gap-3 text-sm"><span>{t("scheduleOn")}</span><Switch checked={enabled} onCheckedChange={setEnabled} /></label>
              {existing ? <Button type="button" variant="outline" size="sm" disabled={testing} onClick={() => { setTesting(true); api(`/api/reporting/views/${existing.id}/send`, { method: "POST" }).then(() => toast.success(t("testSent"))).catch((e) => toast.error(e instanceof Error ? e.message : t("saveFailed"))).finally(() => setTesting(false)); }}>{t("sendTest")}</Button> : null}
            </>
          ) : null}
          {err ? <p className="text-sm text-rose-600">{err}</p> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button><Button onClick={() => void save()} disabled={busy || !name.trim()}>{t("save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
