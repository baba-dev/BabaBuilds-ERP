"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, HelpCircle, Loader2, MessagesSquare, Paperclip, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EmptyMark } from "./CaArt";
import { callApi, formatDay, periodLabel, useJson, useKindName, useMoney, type CaItemView, type Overview } from "./ca-utils";

type RequestRow = {
  id: string; fy: string; kind: "DOCUMENT" | "QUERY"; title: string; status: "OPEN" | "ANSWERED" | "CLOSED"; itemKind: string | null; periodKey: string | null;
  dueDate: string | null; createdByName: string; createdByUserId: string; createdAt: string; updatedAt: string; messageCount: number;
  last: { authorName: string; body: string; at: string } | null;
};
type Message = { id: string; authorUserId: string; authorName: string; body: string; at: string; document: { id: string; title: string } | null };

const STATUS_TONE = { OPEN: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300", ANSWERED: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300", CLOSED: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-300" } as const;
const NONE = "__none__";

export function RequestsTab({ data, fy, askAbout, onAskHandled, onChanged }: { data: Overview; fy: string; askAbout: CaItemView | null; onAskHandled: () => void; onChanged: () => void }) {
  const t = useTranslations("CaCompliance.requests");
  const { locale } = useMoney();
  const [filter, setFilter] = useState<"OPEN" | "ANSWERED" | "CLOSED" | "ALL">("OPEN");
  const list = useJson<{ requests: RequestRow[] }>(`/api/ca/requests?fy=${encodeURIComponent(fy)}${filter === "ALL" ? "" : `&status=${filter}`}`);
  const [creating, setCreating] = useState<{ about: CaItemView | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // A question raised from an obligation opens the form about that obligation; closing it hands control back.
  const formAbout = creating ? creating.about : askAbout;
  const formOpen = creating !== null || askAbout !== null;
  const closeForm = () => { setCreating(null); onAskHandled(); };

  const rows = list.data?.requests ?? [];
  const chip = (active: boolean) => cn("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:text-indigo-200" : "border-border/70 bg-card text-muted-foreground hover:text-foreground");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" role="group" aria-label={t("filterLabel")}>
          {(["OPEN", "ANSWERED", "CLOSED", "ALL"] as const).map((f) => <button key={f} type="button" className={chip(filter === f)} onClick={() => setFilter(f)}>{t(`filter.${f}`)}</button>)}
        </div>
        {data.access.request ? <Button size="sm" onClick={() => setCreating({ about: null })}><Plus className="size-4" aria-hidden />{t("new")}</Button> : null}
      </div>
      <p className="px-1 text-xs text-muted-foreground">{t("hint")}</p>

      {list.error && !list.data ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{list.error}</p> : null}
      {list.data && rows.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-10 text-center"><EmptyMark><MessagesSquare className="size-6" aria-hidden /></EmptyMark><p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p></div> : null}

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setOpenId(r.id)} className="flex w-full flex-wrap items-start gap-3 rounded-2xl border border-border/70 bg-card p-3.5 text-start shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">{r.kind === "DOCUMENT" ? <FileText className="size-4" aria-hidden /> : <HelpCircle className="size-4" aria-hidden />}</span>
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-sm font-semibold">{r.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t(`kind.${r.kind}`)} · {r.createdByName} · {formatDay(r.createdAt, locale)}{r.dueDate ? ` · ${t("needed", { date: formatDay(r.dueDate, locale) })}` : ""}</p>
                {r.last ? <p className="mt-1 line-clamp-1 text-xs text-muted-foreground"><span className="font-medium">{r.last.authorName}:</span> {r.last.body}</p> : null}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", STATUS_TONE[r.status])}>{t(`status.${r.status}`)}</span>
                <span className="text-[11px] text-muted-foreground">{t("messages", { count: r.messageCount })}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <NewRequest open={formOpen} about={formAbout} data={data} fy={fy} onClose={closeForm} onCreated={(id) => { closeForm(); list.reload(); onChanged(); setOpenId(id); }} />
      <Thread id={openId} me={data.me.userId} canReply={data.access.request} canManage={data.access.manage} onClose={() => setOpenId(null)} onChanged={() => { list.reload(); onChanged(); }} />
    </div>
  );
}

function NewRequest({ open, about, data, fy, onClose, onCreated }: { open: boolean; about: CaItemView | null; data: Overview; fy: string; onClose: () => void; onCreated: (id: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">{open ? <NewForm key={about?.id ?? "general"} about={about} data={data} fy={fy} onClose={onClose} onCreated={onCreated} /> : null}</DialogContent>
    </Dialog>
  );
}

function NewForm({ about, data, fy, onClose, onCreated }: { about: CaItemView | null; data: Overview; fy: string; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("CaCompliance.requests");
  const { locale } = useMoney();
  const kindName = useKindName();
  const [kind, setKind] = useState<"DOCUMENT" | "QUERY">(about ? "QUERY" : "DOCUMENT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState(about?.id ?? NONE);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => data.items.filter((i) => i.state !== "NOT_APPLICABLE"), [data.items]);

  async function submit() {
    setBusy(true);
    const item = options.find((i) => i.id === target);
    const res = await callApi<{ id: string }>("POST", "/api/ca/requests", { fy, kind, title, body, itemKind: item?.kind ?? null, periodKey: item?.periodKey ?? null, dueDate: due || null });
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(t("sentToast"));
    onCreated(res.data.id);
  }
  const valid = title.trim().length >= 3 && body.trim().length >= 1;
  return (
    <>
      <DialogHeader><DialogTitle>{t("form.title")}</DialogTitle><DialogDescription>{t("hint")}</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("form.kind")}>
          {(["DOCUMENT", "QUERY"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", kind === k ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:text-indigo-200" : "border-border/70 text-muted-foreground hover:text-foreground")}>{t(`kind.${k}`)}</button>
          ))}
        </div>
        <div className="space-y-1.5"><Label htmlFor="req-title">{t("form.subject")}</Label><Input id="req-title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="req-body">{t("form.details")}</Label><Textarea id="req-body" rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="req-about">{t("form.about")}</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="req-about" className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64"><SelectItem value={NONE}>{t("form.aboutNone")}</SelectItem>{options.map((i) => <SelectItem key={i.id} value={i.id}>{kindName(i)} · {periodLabel(i.periodKey, locale)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="req-due">{t("form.due")}</Label><Input id="req-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>{t("form.cancel")}</Button><Button onClick={submit} disabled={busy || !valid}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}{t("form.send")}</Button></DialogFooter>
    </>
  );
}

function Thread({ id, me, canReply, canManage, onClose, onChanged }: { id: string | null; me: string; canReply: boolean; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  return (
    <Sheet open={!!id} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">{id ? <ThreadBody key={id} id={id} me={me} canReply={canReply} canManage={canManage} onChanged={onChanged} /> : null}</SheetContent>
    </Sheet>
  );
}

function ThreadBody({ id, me, canReply, canManage, onChanged }: { id: string; me: string; canReply: boolean; canManage: boolean; onChanged: () => void }) {
  const t = useTranslations("CaCompliance.requests");
  const { locale } = useMoney();
  const thread = useJson<{ request: RequestRow; messages: Message[] }>(`/api/ca/requests/${id}`);
  const docs = useJson<{ documents: Array<{ id: string; title: string }> }>(canReply ? "/api/documents/list" : null);
  const [text, setText] = useState("");
  const [doc, setDoc] = useState(NONE);
  const [busy, setBusy] = useState(false);
  const r = thread.data?.request;
  const endRef = useRef<HTMLDivElement>(null);
  const count = thread.data?.messages.length ?? 0;
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [count]);

  async function send() {
    setBusy(true);
    const res = await callApi("POST", `/api/ca/requests/${id}/messages`, { body: text, documentId: doc === NONE ? null : doc });
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    setText(""); setDoc(NONE); thread.reload(); onChanged();
  }
  async function setStatus(status: "OPEN" | "CLOSED") {
    setBusy(true);
    const res = await callApi("PATCH", `/api/ca/requests/${id}`, { status });
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    thread.reload(); onChanged();
  }

  if (!r) return <div className="p-6 text-sm text-muted-foreground">{thread.error ?? <Loader2 className="size-5 animate-spin" aria-hidden />}</div>;
  const canClose = r.createdByUserId === me || canManage;
  return (
    <>
      <SheetHeader><SheetTitle>{r.title}</SheetTitle><SheetDescription>{t(`kind.${r.kind}`)} · {t(`status.${r.status}`)}{r.dueDate ? ` · ${t("needed", { date: formatDay(r.dueDate, locale) })}` : ""}</SheetDescription></SheetHeader>
      <ol className="flex-1 space-y-3 px-4 pb-4">
        {thread.data?.messages.map((m) => (
          <li key={m.id} className={cn("flex max-w-[94%] gap-2", m.authorUserId === me ? "ms-auto flex-row-reverse" : "")}>
            <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200" aria-hidden>{m.authorName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"}</span>
            <div className={cn("min-w-0 rounded-2xl px-3.5 py-2.5 text-sm", m.authorUserId === me ? "bg-indigo-50 dark:bg-indigo-500/15" : "bg-muted/60")}>
            <p className="text-[11px] font-semibold text-muted-foreground">{m.authorName} · {formatDay(m.at, locale)}</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>
            {m.document ? <Link href="/documents" className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2 py-1 text-xs font-medium hover:bg-muted/50"><Paperclip className="size-3" aria-hidden />{m.document.title}</Link> : null}
            </div>
          </li>
        ))}
        <div ref={endRef} aria-hidden />
      </ol>
      <div className="sticky bottom-0 space-y-3 border-t bg-background border-border/60 px-4 py-4">
        {r.status === "CLOSED" ? <p className="text-sm text-muted-foreground">{t("thread.closed")}</p> : canReply ? (
          <>
            <Textarea aria-label={t("thread.reply")} rows={3} maxLength={4000} placeholder={t("thread.replyPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && text.trim() && !busy) { e.preventDefault(); void send(); } }} />
            <p className="-mt-1 text-[11px] text-muted-foreground">{t("thread.sendHint")}</p>
            {docs.data && docs.data.documents.length > 0 ? (
              <Select value={doc} onValueChange={setDoc}>
                <SelectTrigger className="h-9" aria-label={t("thread.attach")}><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60"><SelectItem value={NONE}>{t("thread.noDoc")}</SelectItem>{docs.data.documents.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent>
              </Select>
            ) : null}
            <Button onClick={send} disabled={busy || !text.trim()} className="w-full">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}{t("thread.send")}</Button>
          </>
        ) : null}
        {canClose ? <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatus(r.status === "CLOSED" ? "OPEN" : "CLOSED")}>{r.status === "CLOSED" ? t("thread.reopen") : t("thread.close")}</Button> : null}
      </div>
    </>
  );
}
