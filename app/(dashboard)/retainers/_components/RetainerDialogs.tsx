"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { RetainerListItemDto } from "@/lib/retainers/types";
import { useFormat } from "@/hooks/use-format";
import { formatMoney, readApiError } from "./retainer-utils";

type Common = { onDone: () => void; onClose: () => void };
type Target = RetainerListItemDto | null;

const call = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

/* ── Bill now ── */
export function BillNowDialog({ retainer, locale, onDone, onClose }: Common & { retainer: Target; locale: string }) {
  const t = useTranslations("RetainersHub.billNow");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!retainer) return null;
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await call(`/api/retainers/${retainer.id}/bill-now`, "POST", {});
      const payload = (await res.json().catch(() => null)) as { error?: string; invoice?: { invoiceNumber: string }; emailed?: boolean } | null;
      if (!res.ok || !payload?.invoice) { setError(payload?.error || t("failed")); return; }
      toast.success(payload.emailed ? t("successEmailed", { number: payload.invoice.invoiceNumber }) : t("success", { number: payload.invoice.invoiceNumber }));
      onDone();
      onClose();
    } catch { setError(t("failed")); } finally { setBusy(false); }
  };
  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent key={retainer.id}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("description", { name: retainer.name, client: retainer.clientName, total: formatMoney(retainer.total, retainer.currency, locale) })}
            {retainer.pendingUsageCount > 0 ? ` ${t("usage", { count: retainer.pendingUsageCount })}` : ""}
            {` ${retainer.emailInvoice ? t("willEmail") : t("noEmail")}`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void run(); }}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{t("submit")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── Cancel ── */
export function CancelRetainerDialog({ retainer, onDone, onClose }: Common & { retainer: Target }) {
  return retainer ? <CancelBody key={retainer.id} retainer={retainer} onDone={onDone} onClose={onClose} /> : null;
}
function CancelBody({ retainer, onDone, onClose }: Common & { retainer: RetainerListItemDto }) {
  const t = useTranslations("RetainersHub.cancel");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await call(`/api/retainers/${retainer.id}/status`, "PATCH", { status: "CANCELLED", reason: reason.trim() || undefined });
      if (!res.ok) { setError(await readApiError(res, t("failed"))); return; }
      toast.success(t("success"));
      onDone();
      onClose();
    } catch { setError(t("failed")); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description", { name: retainer.name })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">{t("reason")}</Label>
            <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} placeholder={t("reasonPlaceholder")} />
          </div>
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t("keep")}</Button>
            <Button type="submit" variant="destructive" disabled={busy} className="gap-1.5">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{t("submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Delete (never-billed only) ── */
export function DeleteRetainerDialog({ retainer, onDone, onClose }: Common & { retainer: Target }) {
  const t = useTranslations("RetainersHub.delete");
  const [busy, setBusy] = useState(false);
  if (!retainer) return null;
  const run = async () => {
    setBusy(true);
    try {
      const res = await call(`/api/retainers/${retainer.id}`, "DELETE");
      if (!res.ok) { toast.error(await readApiError(res, t("failed"))); return; }
      toast.success(t("success"));
      onDone();
      onClose();
    } catch { toast.error(t("failed")); } finally { setBusy(false); }
  };
  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent key={retainer.id}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("description", { name: retainer.name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void run(); }}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── Add usage ── */
export function AddUsageDialog({ retainer, onDone, onClose }: Common & { retainer: Target }) {
  return retainer ? <UsageBody key={retainer.id} retainer={retainer} onDone={onDone} onClose={onClose} /> : null;
}
function UsageBody({ retainer, onDone, onClose }: Common & { retainer: RetainerListItemDto }) {
  const t = useTranslations("RetainersHub.usage");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = description.trim().length > 0 && Number(quantity) > 0 && unitPrice !== "" && Number(unitPrice) >= 0;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await call(`/api/retainers/${retainer.id}/usage`, "POST", { description: description.trim(), quantity: Number(quantity), unitPrice: Number(unitPrice), taxRate: taxRate === "" ? null : Number(taxRate) });
      if (!res.ok) { setError(await readApiError(res, t("failed"))); return; }
      toast.success(t("success"));
      onDone();
      onClose();
    } catch { setError(t("failed")); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description", { name: retainer.name })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="usage-desc">{t("what")}</Label>
            <Input id="usage-desc" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder={t("whatPlaceholder")} className="h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="usage-qty">{t("quantity")}</Label>
              <Input id="usage-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ""))} className="h-11 tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="usage-price">{t("unitPrice", { currency: retainer.currency })}</Label>
              <Input id="usage-price" inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value.replace(/[^0-9.]/g, ""))} className="h-11 tabular-nums" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="usage-tax">{t("taxRate")}</Label>
            <Input id="usage-tax" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={t("taxSame")} className="h-11 tabular-nums" />
            <p className="text-xs text-muted-foreground">{t("taxHint")}</p>
          </div>
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
            <Button type="submit" variant="primary-action" disabled={!valid || busy} className="gap-1.5">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{t("submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Schedule a price change ── */
export function PriceChangeDialog({ retainer, onDone, onClose }: Common & { retainer: Target }) {
  return retainer ? <PriceBody key={retainer.id} retainer={retainer} onDone={onDone} onClose={onClose} /> : null;
}
function PriceBody({ retainer, onDone, onClose }: Common & { retainer: RetainerListItemDto }) {
  const t = useTranslations("RetainersHub.price");
  const { locale } = useFormat();
  const [date, setDate] = useState(() => retainer.nextBillingDate.slice(0, 10));
  const [percent, setPercent] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(percent);
  const valid = percent !== "" && Number.isFinite(value) && value !== 0 && value >= -90 && value <= 500 && Boolean(date);
  const preview = valid ? Number(retainer.subtotal) * (1 + value / 100) : null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await call(`/api/retainers/${retainer.id}/price-changes`, "POST", { effectiveDate: date, percent: value, note: note.trim() || null });
      if (!res.ok) { setError(await readApiError(res, t("failed"))); return; }
      toast.success(t("success"));
      onDone();
      onClose();
    } catch { setError(t("failed")); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description", { name: retainer.name })}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="price-date">{t("from")}</Label>
              <Input id="price-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price-pct">{t("percent")}</Label>
              <Input id="price-pct" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^0-9.\-]/g, ""))} placeholder="+8" className="h-11 tabular-nums" />
            </div>
          </div>
          {preview !== null && <p className="rounded-lg bg-muted/50 p-2.5 text-sm tabular-nums">{t("preview", { from: formatMoney(retainer.subtotal, retainer.currency, locale), to: formatMoney(preview, retainer.currency, locale) })}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="price-note">{t("note")}</Label>
            <Input id="price-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} className="h-11" />
          </div>
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
            <Button type="submit" variant="primary-action" disabled={!valid || busy} className="gap-1.5">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{t("submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
