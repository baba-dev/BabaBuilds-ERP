"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CustomItemDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (i: { name: string; price: number; taxRate: number }) => void }) {
  return open ? <Body onClose={onClose} onAdd={onAdd} /> : null;
}

function Body({ onClose, onAdd }: { onClose: () => void; onAdd: (i: { name: string; price: number; taxRate: number }) => void }) {
  const t = useTranslations("PosRegister");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [rate, setRate] = useState("0");
  const p = Number(price);
  const valid = name.trim().length > 0 && Number.isFinite(p) && p > 0 && Number(rate) >= 0 && Number(rate) <= 100;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{t("custom.title")}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) onAdd({ name: name.trim(), price: p, taxRate: Number(rate) }); }}>
          <div><Label htmlFor="ci-name">{t("custom.name")}</Label><Input id="ci-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="ci-price">{t("custom.price")}</Label><Input id="ci-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} /></div>
            <div><Label htmlFor="ci-rate">{t("custom.gst")}</Label><Input id="ci-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} /></div>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button><Button type="submit" disabled={!valid}>{t("custom.add")}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
