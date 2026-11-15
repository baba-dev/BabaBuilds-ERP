"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { api, type Product } from "./shared";

type Mode = "ADD" | "REMOVE" | "COUNT";

/** Add, remove or count stock for one product. */
export function StockDialog({ product, onClose, onDone }: { product: Product | null; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("InventoryHub");
  const [mode, setMode] = useState<Mode>("ADD");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (product) { setMode("ADD"); setQty(""); setReason(""); } }, [product]);
  if (!product) return null;

  const n = Number(qty);
  const valid = qty !== "" && Number.isInteger(n) && n >= 0 && (mode === "COUNT" || n > 0) && (mode !== "REMOVE" || n <= product.currentStock);
  const after = mode === "ADD" ? product.currentStock + (n || 0) : mode === "REMOVE" ? product.currentStock - (n || 0) : n || 0;

  const submit = async () => {
    setBusy(true);
    try {
      await api("/api/inventory/adjust", { method: "POST", body: JSON.stringify({ productId: product.id, mode, quantity: n, reason: reason || undefined }) });
      toast.success(t("stock.saved"));
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("stock.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{product.name}</DialogTitle></DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">{t("stock.onHand", { stock: product.currentStock, unit: product.unit })}</p>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="tablist">
          {(["ADD", "REMOVE", "COUNT"] as const).map((m) => <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("rounded-lg py-1.5 text-sm transition-colors", mode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>{t(`stock.mode.${m}`)}</button>)}
        </div>
        <div className="space-y-3">
          <div><Label htmlFor="inv-qty">{mode === "COUNT" ? t("stock.counted") : t("stock.quantity")}</Label><Input id="inv-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} autoFocus /></div>
          <div><Label htmlFor="inv-reason">{t("stock.reason")}</Label><Input id="inv-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={t(`stock.reasonHint.${mode}`)} /></div>
          {mode === "REMOVE" && n > product.currentStock ? <p className="text-sm text-rose-600">{t("stock.tooMany")}</p> : null}
          {qty !== "" && valid ? <p className="text-sm text-muted-foreground">{t("stock.after", { stock: after, unit: product.unit })}</p> : null}
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>{t("cancel")}</Button><Button onClick={submit} disabled={!valid || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("stock.save")}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
