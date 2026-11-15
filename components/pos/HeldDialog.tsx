"use client";

import { PlayCircle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Hold } from "./shared";

export function HeldDialog({ open, holds, money, locale, onClose, onResume, onDiscard }: { open: boolean; holds: Hold[]; money: (n: number) => string; locale: string; onClose: () => void; onResume: (h: Hold) => void; onDiscard: (h: Hold) => void }) {
  const t = useTranslations("PosRegister");
  const fmt = new Intl.DateTimeFormat(locale, { timeStyle: "short", dateStyle: "medium" });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{t("heldTitle")}</DialogTitle></DialogHeader>
        {holds.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t("heldEmpty")}</p> : (
          <ul className="space-y-2">
            {holds.map((h) => (
              <li key={h.id} className="flex items-center gap-3 rounded-xl border p-3">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{h.label || t("heldDefault", { n: h.itemCount })}</p><p className="text-xs text-muted-foreground">{t("heldMeta", { items: h.itemCount, time: fmt.format(new Date(h.createdAt)) })}</p></div>
                <span className="font-semibold tabular-nums">{money(h.total)}</span>
                <Button size="icon" variant="outline" aria-label={t("resume")} onClick={() => onResume(h)}><PlayCircle className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="text-rose-600" aria-label={t("discard")} onClick={() => onDiscard(h)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
