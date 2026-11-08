"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink, Loader2, Lock, MessageSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { StateChip, callApi, formatDay, periodLabel, useJson, useKindName, useMoney, type CaItemView, type Overview } from "./ca-utils";

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "READY", "FILED", "NOT_APPLICABLE"] as const;
const NONE = "__none__";
const today = () => new Date().toISOString().slice(0, 10);

export function ItemDrawer({ item, data, fy, onClose, onChanged, onAsk }: { item: CaItemView | null; data: Overview; fy: string; onClose: () => void; onChanged: () => void; onAsk: (i: CaItemView) => void }) {
  return (
    <Sheet open={!!item} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {item ? <ItemForm key={item.id} item={item} data={data} fy={fy} onClose={onClose} onChanged={onChanged} onAsk={onAsk} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function ItemForm({ item, data, fy, onClose, onChanged, onAsk }: { item: CaItemView; data: Overview; fy: string; onClose: () => void; onChanged: () => void; onAsk: (i: CaItemView) => void }) {
  const t = useTranslations("CaCompliance.drawer");
  const tS = useTranslations("CaCompliance.drawer.statuses");
  const { locale, m } = useMoney();
  const kindName = useKindName();
  const team = useJson<{ members: Array<{ userId: string; name: string }> }>("/api/ca/team");
  const canEdit = data.access.manage;
  const [status, setStatus] = useState<string>(item.status);
  const [filedAt, setFiledAt] = useState(item.filedAt?.slice(0, 10) ?? "");
  const [reference, setReference] = useState(item.reference ?? "");
  const [owner, setOwner] = useState(item.ownerUserId ?? NONE);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [extension, setExtension] = useState(item.dueOverride?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const body: Record<string, unknown> = { kind: item.kind, periodKey: item.periodKey, fy, ownerUserId: owner === NONE ? null : owner, notes: notes || null };
    if (!item.statusLocked) Object.assign(body, { status, filedAt: status === "FILED" ? filedAt || today() : null, reference: reference || null, dueOverride: extension || null });
    const res = await callApi<{ signOffCleared?: boolean }>("PUT", "/api/ca/items", body);
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.data.signOffCleared ? t("signoffCleared") : t("saved"));
    onChanged();
    onClose();
  }

  async function sign(undo: boolean) {
    setBusy(true);
    const res = await callApi("POST", "/api/ca/items/signoff", { kind: item.kind, periodKey: item.periodKey, fy, undo });
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(undo ? t("signoffRemoved") : t("signedToast"));
    onChanged();
    onClose();
  }

  const canSign = data.access.signoff && item.state === "FILED";
  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">{kindName(item)}<StateChip state={item.state} /></SheetTitle>
        <SheetDescription>{periodLabel(item.periodKey, locale)} · {t("due", { date: formatDay(item.effectiveDue, locale) })}{item.amount ? ` · ${t("amountDue", { amount: m(item.amount) })}` : ""}</SheetDescription>
      </SheetHeader>

      <div className="space-y-4 px-4 pb-6">
        {item.statusLocked ? <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t("gstLocked")}</p> : null}

        {!item.statusLocked ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ca-status">{t("status")}</Label>
              <Select value={status} onValueChange={setStatus} disabled={!canEdit}>
                <SelectTrigger id="ca-status" className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{tS(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {status === "FILED" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="ca-filed">{t("filedOn")}</Label><Input id="ca-filed" type="date" value={filedAt || today()} max={today()} onChange={(e) => setFiledAt(e.target.value)} disabled={!canEdit} /></div>
                <div className="space-y-1.5"><Label htmlFor="ca-ref">{t("reference")}</Label><Input id="ca-ref" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} disabled={!canEdit} /></div>
              </div>
            ) : null}
          </>
        ) : item.reference ? <p className="text-sm"><span className="text-muted-foreground">{t("reference")}: </span><span className="font-mono">{item.reference}</span></p> : null}

        <div className="space-y-1.5">
          <Label htmlFor="ca-owner">{t("owner")}</Label>
          <Select value={owner} onValueChange={setOwner} disabled={!canEdit}>
            <SelectTrigger id="ca-owner" className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>{t("noOwner")}</SelectItem>{(team.data?.members ?? []).map((mm) => <SelectItem key={mm.userId} value={mm.userId}>{mm.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5"><Label htmlFor="ca-notes">{t("notes")}</Label><Textarea id="ca-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} /></div>

        {!item.statusLocked ? (
          <div className="space-y-1.5">
            <Label htmlFor="ca-ext">{t("extension")}</Label>
            <Input id="ca-ext" type="date" value={extension} onChange={(e) => setExtension(e.target.value)} disabled={!canEdit} />
            <p className="text-xs text-muted-foreground">{t("extensionHint")}</p>
          </div>
        ) : null}

        {canEdit ? <Button onClick={save} disabled={busy} className="w-full">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}{t("save")}</Button> : <p className="text-xs text-muted-foreground">{t("readOnly")}</p>}

        <div className="space-y-2 rounded-2xl border border-border/70 p-3.5">
          {item.signedOffAt ? (
            <>
              <p className="flex items-start gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />{t("signedBy", { name: item.signedOffBy ?? "—", date: formatDay(item.signedOffAt, locale) })}</p>
              {data.access.signoff ? <Button variant="outline" size="sm" disabled={busy} onClick={() => sign(true)}>{t("removeSignoff")}</Button> : null}
            </>
          ) : data.access.signoff ? (
            <>
              <Button variant="outline" size="sm" disabled={busy || !canSign} onClick={() => sign(false)}><ShieldCheck className="size-4" aria-hidden />{t("signoff")}</Button>
              {!canSign ? <p className="text-xs text-muted-foreground">{t("needsFiled")}</p> : null}
            </>
          ) : <p className="text-xs text-muted-foreground">{t("notSigned")}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          {data.access.request ? <Button variant="ghost" size="sm" onClick={() => onAsk(item)}><MessageSquare className="size-4" aria-hidden />{t("ask")}</Button> : null}
          {item.href ? <Button asChild variant="ghost" size="sm"><Link href={item.href}><ExternalLink className="size-4" aria-hidden />{t("openWork")}</Link></Button> : null}
        </div>
      </div>
    </>
  );
}
