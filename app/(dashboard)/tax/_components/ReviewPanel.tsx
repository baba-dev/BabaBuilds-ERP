"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { callApi, periodLabel, useJson, useMoney, type GstAccessFlags, type ObligationView } from "./gst-utils";

type Thread = { comments: Array<{ id: string; author: string; mine: boolean; body: string; createdAt: string }> };

/** Review workflow + comment thread for one return, so an accountant can check and sign off before filing. */
export function ReviewButton({ obligation, access, onChanged }: { obligation: ObligationView; access: GstAccessFlags; onChanged: () => void }) {
  const t = useTranslations("GstHub.review");
  const [open, setOpen] = useState(false);
  const status = obligation.reviewStatus;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={t("open")}>
        <MessageSquare className="me-1.5 size-4" aria-hidden />
        {status === "APPROVED" ? t("approved") : status === "READY_FOR_REVIEW" ? t("inReview") : t("review")}
        {obligation.commentCount > 0 ? <span className="ms-1.5 rounded-full bg-indigo-600 px-1.5 text-[11px] font-bold text-white">{obligation.commentCount}</span> : null}
      </Button>
      {open ? <ReviewSheet obligation={obligation} access={access} onClose={() => setOpen(false)} onChanged={onChanged} /> : null}
    </>
  );
}

function ReviewSheet({ obligation, access, onClose, onChanged }: { obligation: ObligationView; access: GstAccessFlags; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("GstHub.review");
  const { locale } = useMoney();
  const { data, loading, reload } = useJson<Thread>(`/api/gst/comments?returnType=${obligation.returnType}&period=${encodeURIComponent(obligation.periodKey)}`);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const status = obligation.reviewStatus;
  const filed = obligation.status === "FILED";

  async function post() {
    setBusy(true);
    const r = await callApi("POST", "/api/gst/comments", { returnType: obligation.returnType, periodKey: obligation.periodKey, body: text });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setText("");
    reload();
    onChanged();
  }
  async function act(action: "REQUEST_REVIEW" | "APPROVE" | "RETURN_TO_DRAFT") {
    setBusy(true);
    const r = await callApi("PUT", "/api/gst/filings", { returnType: obligation.returnType, periodKey: obligation.periodKey, action });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(t(`done.${action}`));
    onChanged();
    onClose();
  }

  return (
    <Sheet open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("title", { label: obligation.label, period: periodLabel(obligation.periodKey, locale) })}</SheetTitle>
          <SheetDescription>{status === "APPROVED" ? t("stateApproved") : status === "READY_FOR_REVIEW" ? t("stateReview") : t("stateDraft")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-wrap gap-2 px-4">
          {!filed && access.manage && status !== "READY_FOR_REVIEW" && status !== "APPROVED" ? <Button size="sm" onClick={() => act("REQUEST_REVIEW")} disabled={busy}><Send className="me-1.5 size-4" aria-hidden />{t("request")}</Button> : null}
          {!filed && access.approve && status === "READY_FOR_REVIEW" ? <Button size="sm" onClick={() => act("APPROVE")} disabled={busy}><CheckCircle2 className="me-1.5 size-4" aria-hidden />{t("approve")}</Button> : null}
          {!filed && access.manage && (status === "READY_FOR_REVIEW" || status === "APPROVED") ? <Button size="sm" variant="outline" onClick={() => act("RETURN_TO_DRAFT")} disabled={busy}>{t("back")}</Button> : null}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
          {loading && !data ? <p className="text-sm text-muted-foreground">…</p> : null}
          {data && data.comments.length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{t("empty")}</p> : null}
          {data?.comments.map((c) => (
            <div key={c.id} className={cn("max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm", c.mine ? "ms-auto bg-indigo-600 text-white" : "bg-muted")}>
              <p className={cn("text-[11px] font-semibold", c.mine ? "text-indigo-100" : "text-muted-foreground")}>{c.mine ? t("you") : c.author} · {new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(c.createdAt))}</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-border/60 p-4">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={3} placeholder={t("placeholder")} aria-label={t("placeholder")} />
          <div className="mt-2 flex justify-end"><Button size="sm" onClick={post} disabled={busy || !text.trim()}>{busy ? <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden /> : null}{t("send")}</Button></div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
