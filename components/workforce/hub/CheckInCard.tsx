"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Coffee, LogIn, LogOut, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";

type Today = {
  linked: boolean;
  status?: string;
  workingDay?: boolean;
  record?: { status: string; checkInAt: string | null; checkOutAt: string | null } | null;
  schedule?: { workStart: string; workEnd: string; timeZone: string };
};

/** Self-service check-in/out for the signed-in person. The server decides what "today" is. */
export function CheckInCard({ onChanged }: { onChanged?: () => void }) {
  const t = useTranslations("WorkforceHub");
  const locale = useLocale();
  const [state, setState] = useState<Today | null>(null);
  const [remote, setRemote] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/workforce/attendance/today");
    if (res.ok) setState((await res.json()) as Today);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(action: "CHECK_IN" | "CHECK_OUT") {
    setBusy(true);
    try {
      const res = await fetch("/api/workforce/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "CHECK_IN" ? { action, remote } : { action }) });
      if (!res.ok) { const j = (await res.json().catch(() => ({}))) as { error?: string }; toast.error(j.error ?? t("error")); return; }
      await load();
      onChanged?.();
    } finally { setBusy(false); }
  }

  const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: state?.schedule?.timeZone }) : "");
  if (!state) return <div className="h-40 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />;
  const rec = state.record;

  return (
    <section className="rounded-2xl border border-zinc-200/60 bg-white/60 p-5 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-950/40" aria-labelledby="wf-checkin">
      <h2 id="wf-checkin" className="text-sm font-black text-zinc-900 dark:text-zinc-100">{t("checkin.title")}</h2>
      {!state.linked ? (
        <p className="mt-3 text-sm text-zinc-500">{t("checkin.notLinked")}</p>
      ) : state.status === "INACTIVE" ? (
        <p className="mt-3 text-sm text-zinc-500">{t("checkin.inactive")}</p>
      ) : !state.workingDay ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"><PartyPopper className="h-4 w-4 text-amber-500" />{t("checkin.off")}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {state.schedule && <p className="text-xs text-zinc-500">{t("checkin.hours", { start: state.schedule.workStart, end: state.schedule.workEnd })}</p>}
          {rec?.checkInAt && <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{t("checkin.inAt", { time: time(rec.checkInAt) })} · {t(`status.${rec.status}`)}</p>}
          {rec?.checkOutAt && <p className="text-sm text-zinc-600 dark:text-zinc-300">{t("checkin.outAt", { time: time(rec.checkOutAt) })}</p>}
          {!rec?.checkInAt ? (
            <>
              <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} className="h-4 w-4 accent-teal-600" />{t("checkin.remote")}
              </label>
              <Button onClick={() => void act("CHECK_IN")} disabled={busy} className="h-11 w-full"><LogIn className="me-2 h-4 w-4" />{t("checkin.checkIn")}</Button>
            </>
          ) : !rec.checkOutAt ? (
            <Button onClick={() => void act("CHECK_OUT")} disabled={busy} variant="outline" className="h-11 w-full"><LogOut className="me-2 h-4 w-4" />{t("checkin.checkOut")}</Button>
          ) : (
            <p className="flex items-center gap-2 text-sm text-zinc-500"><Coffee className="h-4 w-4" />{t("checkin.done")}</p>
          )}
        </div>
      )}
    </section>
  );
}
