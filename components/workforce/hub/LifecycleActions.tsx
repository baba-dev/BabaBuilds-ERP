"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** End or resume employment. Ending sets the last working day and cancels leave booked after it. */
export function LifecycleActions({ employeeId, status, onDone }: { employeeId: string; status: string; onDone: () => void }) {
  const t = useTranslations("WorkforceHub");
  const [open, setOpen] = useState(false);
  const [exitDate, setExitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(path: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(`/api/workforce/employees/${employeeId}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = (await res.json().catch(() => ({}))) as { error?: string; cancelledLeave?: number };
      if (!res.ok) { toast.error(j.error ?? t("error")); return; }
      toast.success(path === "offboard" ? t("people.offboarded", { count: j.cancelledLeave ?? 0 }) : t("people.reactivated"));
      setOpen(false);
      onDone();
    } finally { setBusy(false); }
  }

  if (status === "INACTIVE") return <Button size="sm" variant="outline" disabled={busy} onClick={() => void call("reactivate")} className="h-8 text-xs">{t("people.reactivate")}</Button>;
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="h-8 text-xs text-rose-600">{t("people.offboard")}</Button>;
  return (
    <div className="w-full space-y-2 rounded-xl border border-rose-300/60 bg-rose-500/5 p-3 sm:w-72">
      <p className="text-xs text-zinc-600 dark:text-zinc-300">{t("people.offboardHint")}</p>
      <label className="block text-xs font-semibold">{t("people.lastDay")}<input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-transparent px-2 text-sm dark:border-zinc-700" /></label>
      <label className="block text-xs font-semibold">{t("people.reason")}<input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-transparent px-2 text-sm dark:border-zinc-700" /></label>
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => void call("offboard", { exitDate, reason: reason || null })} className="h-8 text-xs">{t("people.offboardConfirm")}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="h-8 text-xs">{t("leave.cancel")}</Button>
      </div>
    </div>
  );
}
