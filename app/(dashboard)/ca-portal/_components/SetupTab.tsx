"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Section, callApi, formatDay, useJson, useMoney, type Overview } from "./ca-utils";

const ENTITIES = ["PROPRIETOR", "PARTNERSHIP", "LLP", "COMPANY", "OTHER"] as const;
type Team = { accountants: Array<{ userId: string; name: string; email: string | null; lastActiveAt: string | null }>; pendingInvites: Array<{ id: string; email: string; expiresAt: string }> };

export function SetupTab({ data, onSaved }: { data: Overview; onSaved: () => void }) {
  const t = useTranslations("CaCompliance.setup");
  const tT = useTranslations("CaCompliance.team");
  const { locale } = useMoney();
  const team = useJson<Team>("/api/ca/team");
  const s = data.setup;
  const canEdit = data.access.manage;
  const [entity, setEntity] = useState<string>(s.entityType ?? "");
  const [regime, setRegime] = useState<string>(s.taxRegime ?? "NEW");
  const [presumptive, setPresumptive] = useState<string>(s.presumptive);
  const [audit, setAudit] = useState(s.taxAuditApplicable);
  const [tan, setTan] = useState(s.tan ?? "");
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState(false);

  const individual = entity === "PROPRIETOR" || entity === "OTHER";
  const canPresume = entity === "PROPRIETOR" || entity === "PARTNERSHIP";

  async function save() {
    setBusy(true);
    const res = await callApi("PATCH", "/api/ca/settings", { entityType: entity, taxRegime: individual ? regime : null, presumptive: canPresume ? presumptive : "NONE", taxAuditApplicable: audit, tan: tan.trim() ? tan.trim().toUpperCase() : null });
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(t("saved"));
    onSaved();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title={t("title")} hint={t("hint")}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ca-entity">{t("entity")}</Label>
            <Select value={entity} onValueChange={setEntity} disabled={!canEdit}>
              <SelectTrigger id="ca-entity" className="h-10"><SelectValue placeholder={t("entityPlaceholder")} /></SelectTrigger>
              <SelectContent>{ENTITIES.map((e) => <SelectItem key={e} value={e}>{t(`entities.${e}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {individual ? (
            <div className="space-y-1.5">
              <Label htmlFor="ca-regime">{t("regime")}</Label>
              <Select value={regime} onValueChange={setRegime} disabled={!canEdit}>
                <SelectTrigger id="ca-regime" className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="NEW">{t("regimes.NEW")}</SelectItem><SelectItem value="OLD">{t("regimes.OLD")}</SelectItem></SelectContent>
              </Select>
            </div>
          ) : null}
          {canPresume ? (
            <div className="space-y-1.5">
              <Label htmlFor="ca-presumptive">{t("presumptive")}</Label>
              <Select value={presumptive} onValueChange={setPresumptive} disabled={!canEdit}>
                <SelectTrigger id="ca-presumptive" className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>{(["NONE", "SEC_44ADA", "SEC_44AD"] as const).map((p) => <SelectItem key={p} value={p}>{t(`presumptives.${p}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-3.5">
            <div className="min-w-0"><Label htmlFor="ca-audit" className="text-sm font-medium">{t("audit")}</Label><p className="mt-0.5 text-xs text-muted-foreground">{t("auditHint")}</p></div>
            <Switch id="ca-audit" checked={audit} onCheckedChange={setAudit} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ca-tan">{t("tan")}</Label>
            <Input id="ca-tan" value={tan} maxLength={10} onChange={(e) => setTan(e.target.value.toUpperCase())} className="font-mono" placeholder="DELA12345B" disabled={!canEdit} />
            <p className="text-xs text-muted-foreground">{t("tanHint")}</p>
          </div>
          {canEdit ? <Button onClick={save} disabled={busy || !entity} className="w-full sm:w-auto">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}{t("save")}</Button> : <p className="text-xs text-muted-foreground">{t("readOnly")}</p>}
        </div>
      </Section>

      <Section title={tT("title")} hint={tT("hint")} right={data.access.invite ? <Button size="sm" variant="outline" onClick={() => setInviting(true)}><UserPlus className="size-4" aria-hidden />{tT("invite")}</Button> : undefined}>
        <div className="space-y-4">
          {team.data && team.data.accountants.length === 0 && team.data.pendingInvites.length === 0 ? <p className="text-sm text-muted-foreground">{tT("none")}</p> : null}
          <ul className="space-y-2">
            {(team.data?.accountants ?? []).map((a) => (
              <li key={a.userId} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3.5 py-2.5">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{a.name}</p><p className="truncate text-xs text-muted-foreground">{a.email}</p></div>
                <p className="shrink-0 text-xs text-muted-foreground">{a.lastActiveAt ? tT("lastSeen", { date: formatDay(a.lastActiveAt, locale) }) : tT("never")}</p>
              </li>
            ))}
          </ul>
          {(team.data?.pendingInvites.length ?? 0) > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tT("pending")}</p>
              <ul className="space-y-1.5">{team.data?.pendingInvites.map((i) => <li key={i.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{i.email}</span><span className="shrink-0 text-xs text-muted-foreground">{tT("expires", { date: formatDay(i.expiresAt, locale) })}</span></li>)}</ul>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{tT("roleNote")}</p>
          {!data.access.invite ? <p className="text-xs text-muted-foreground">{tT("noInvite")}</p> : null}
        </div>
      </Section>
      <InviteDialog open={inviting} onClose={() => setInviting(false)} onSent={() => { setInviting(false); team.reload(); }} />
    </div>
  );
}

function InviteDialog({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const t = useTranslations("CaCompliance.team");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const res = await callApi("POST", "/api/team/invite", { email: email.trim(), businessRole: "ACCOUNTANT" });
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(t("sent"));
    setEmail("");
    onSent();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("inviteTitle")}</DialogTitle><DialogDescription>{t("roleNote")}</DialogDescription></DialogHeader>
        <div className="space-y-1.5"><Label htmlFor="ca-invite">{t("email")}</Label><Input id="ca-invite" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ca@firm.in" /></div>
        <DialogFooter><Button variant="outline" onClick={onClose}>{t("cancel")}</Button><Button onClick={send} disabled={busy || !/^\S+@\S+\.\S+$/.test(email)}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}{t("send")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
