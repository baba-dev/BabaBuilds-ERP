"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore, ArrowLeft, Download, FilePlus2, Globe, Loader2, Mail, Pencil, Phone, Pin, Plus, Repeat, ScrollText, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useFormat } from "@/hooks/use-format";
import { getBustedUrl } from "@/lib/cache-buster";
import { cn } from "@/lib/utils";
import { ClientFormDialog } from "../_components/ClientFormDialog";
import { api, daysSince, flag, HealthBadge, initials, money, shortDate, type ClientRowData, type Credit, type Health, type Metrics } from "../_components/shared";

type Contact = { id: string; name: string; role: string | null; email: string | null; phone: string | null; isPrimary: boolean; receivesInvoices: boolean; receivesReminders: boolean };
type Note = { id: string; body: string; pinned: boolean; authorName: string; createdAt: string };
type Overview = {
  client: ClientRowData & { lastContactedAt: string | null; archivedAt: string | null; source: string };
  owner: { name: string | null; email: string } | null;
  contacts: Contact[]; notes: Note[]; metrics: Metrics;
  payment: { avgDaysToPay: number | null; onTimeRate: number | null; sample: number; termsDays: number };
  health: Health; credit: Credit;
  invoices: Array<{ id: string; invoiceNumber: string; invoiceDate: string; dueDate: string | null; status: string; grandTotal: number; amountReceived: number | null; currency: string }>;
  proposals: Array<{ id: string; proposalNo: string; title: string; status: string; dateCreated: string; validUntil: string }>;
  retainers: Array<{ id: string; name: string | null; serviceName: string | null; status: string; frequency: string; nextBillingDate: string | null; currency: string; amount: number | null }>;
  timeline: Array<{ at: string; type: "INVOICE" | "PAYMENT" | "PROPOSAL" | "RETAINER" | "NOTE" | "CHANGE"; title: string; ref?: string; amount?: number; currency?: string }>;
};

const STATUS_TONE: Record<string, string> = { PAID: "text-emerald-600", PENDING: "text-amber-600", PARTIALLY_PAID: "text-amber-600", VOID: "text-muted-foreground line-through", DRAFT: "text-muted-foreground" };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="min-w-0"><dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-0.5 truncate text-sm font-medium">{children}</dd></div>);
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("ClientsCrm");
  const router = useRouter();
  const { locale, countryCode: workspaceCountry, currency: baseCurrency } = useFormat();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [contactForm, setContactForm] = useState<Partial<Contact> | null>(null);

  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; });
  const load = useCallback(async () => {
    const r = await api<Overview>(`/api/clients/${id}?overview=1`);
    if (!r.ok) { setError(r.status === 404 ? tRef.current("notFound") : (r.data.error ?? tRef.current("loadFailed"))); return; }
    setError(null); setData(r.data);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return (<div className="mx-auto max-w-xl space-y-4 p-8 text-center"><p role="alert">{error}</p><Button asChild variant="outline"><Link href="/clients"><ArrowLeft className="mr-2 size-4 rtl:rotate-180" aria-hidden />{t("back")}</Link></Button></div>);
  if (!data) return (<div className="space-y-4 p-4 md:p-8"><Skeleton className="h-28 w-full rounded-3xl" /><Skeleton className="h-24 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div>);

  const { client, metrics, health, credit, payment } = data;
  const m = (n: number) => money(n, baseCurrency, locale);
  const archived = Boolean(client.archivedAt);
  const lastContact = daysSince(client.lastContactedAt);

  async function archiveToggle() {
    setBusy(true);
    const r = await api(`/api/clients/${id}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: !archived }) });
    setBusy(false); setConfirm(null);
    if (!r.ok) return toast.error(r.data.error ?? t("toast.failed"));
    toast.success(archived ? t("toast.restored") : t("toast.archived"));
    void load();
  }
  async function remove() {
    setBusy(true);
    const r = await api(`/api/clients/${id}`, { method: "DELETE" });
    setBusy(false); setConfirm(null);
    if (!r.ok) return toast.error(r.data.error ?? t("toast.failed"));
    toast.success(t("toast.deleted")); router.push("/clients");
  }
  async function addNote() {
    if (!noteText.trim()) return;
    setBusy(true);
    const r = await api(`/api/clients/${id}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: noteText }) });
    setBusy(false);
    if (!r.ok) return toast.error(r.data.error ?? t("toast.failed"));
    setNoteText(""); void load();
  }
  async function noteAction(noteId: string, method: "PATCH" | "DELETE", body?: unknown) {
    const r = await api(`/api/clients/${id}/notes/${noteId}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) return toast.error(r.data.error ?? t("toast.failed"));
    void load();
  }
  async function saveContact() {
    if (!contactForm?.name?.trim()) return;
    setBusy(true);
    const payload = { name: contactForm.name, role: contactForm.role ?? null, email: contactForm.email ?? null, phone: contactForm.phone ?? null, isPrimary: Boolean(contactForm.isPrimary), receivesInvoices: contactForm.receivesInvoices ?? true, receivesReminders: contactForm.receivesReminders ?? true };
    const url = contactForm.id ? `/api/clients/${id}/contacts/${contactForm.id}` : `/api/clients/${id}/contacts`;
    const r = await api(url, { method: contactForm.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(false);
    if (!r.ok) return toast.error(r.data.error ?? t("toast.failed"));
    setContactForm(null); void load();
  }
  async function removeContact(cid: string) {
    const r = await api(`/api/clients/${id}/contacts/${cid}`, { method: "DELETE" });
    if (!r.ok) return toast.error(r.data.error ?? t("toast.failed"));
    void load();
  }

  const asRow = { ...client, metrics, health, credit, payment: { ...payment }, contactCount: data.contacts.length } as ClientRowData;
  const creditPct = credit.limit ? Math.min(100, Math.round((credit.used / credit.limit) * 100)) : 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t("back")}</Link>

      <header className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-indigo-500/10 via-card to-card p-5 md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-16 rounded-2xl"><AvatarImage src={client.logoUrl ? getBustedUrl(client.logoUrl) : undefined} alt="" /><AvatarFallback className="rounded-2xl bg-indigo-500/15 text-xl text-indigo-700 dark:text-indigo-300">{initials(client.name)}</AvatarFallback></Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{client.name}</h1>
                {client.status === "VIP" && <Star className="size-5 fill-amber-400 text-amber-400" aria-label="VIP" />}
                {archived && <Badge variant="outline">{t("archivedBadge")}</Badge>}
                <HealthBadge health={health} label={t(`health.${health.label}` as never)} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{flag(client.countryCode)} {client.country}</span>
                {client.email && <a className="inline-flex items-center gap-1 hover:text-foreground" href={`mailto:${client.email}`}><Mail className="size-3.5" aria-hidden />{client.email}</a>}
                {client.phone && <a className="inline-flex items-center gap-1 hover:text-foreground" href={`tel:${client.phone}`}><Phone className="size-3.5" aria-hidden />{client.phone}</a>}
                {client.website && <a className="inline-flex items-center gap-1 hover:text-foreground" href={client.website} target="_blank" rel="noopener noreferrer"><Globe className="size-3.5" aria-hidden />{client.website.replace(/^https?:\/\//, "")}</a>}
              </p>
              {client.tagList.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{client.tagList.map((x) => <Badge key={x} variant="secondary">{x}</Badge>)}</div>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!archived && <Button asChild><Link href={`/income/new?client=${id}`}><FilePlus2 className="mr-2 size-4" aria-hidden />{t("actions.invoice")}</Link></Button>}
            {!archived && <Button asChild variant="outline"><Link href={`/proposals/new?client=${id}`}><ScrollText className="mr-2 size-4" aria-hidden />{t("actions.proposal")}</Link></Button>}
            {!archived && <Button asChild variant="outline"><Link href={`/retainers/new?client=${id}`}><Repeat className="mr-2 size-4" aria-hidden />{t("actions.retainer")}</Link></Button>}
            <Button variant="outline" onClick={() => setEdit(true)}><Pencil className="mr-2 size-4" aria-hidden />{t("actions.edit")}</Button>
          </div>
        </div>
      </header>

      <section aria-label={t("summary")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: t("stats.billed"), v: m(metrics.billed), s: t("invoiceCount", { count: metrics.invoiceCount }) },
          { l: t("stats.outstanding"), v: m(metrics.outstanding), s: metrics.overdue > 0 ? t("overdueAmount", { amount: m(metrics.overdue) }) : t("onTrack"), tone: metrics.overdue > 0 ? "text-rose-600 dark:text-rose-400" : "" },
          { l: t("stats.avgDays"), v: payment.avgDaysToPay === null ? "—" : t("days", { count: Math.round(payment.avgDaysToPay) }), s: payment.onTimeRate === null ? t("noHistory") : t("onTime", { pct: Math.round(payment.onTimeRate * 100) }) },
          { l: t("stats.terms"), v: t("days", { count: payment.termsDays }), s: lastContact === null ? t("neverContacted") : t("contactedAgo", { count: lastContact }) },
        ].map((x) => (<div key={x.l} className="rounded-2xl border bg-card p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{x.l}</p><p className={cn("mt-1 text-2xl font-semibold tabular-nums", x.tone)}>{x.v}</p><p className="text-xs text-muted-foreground">{x.s}</p></div>))}
      </section>

      {credit.state !== "NONE" && (
        <div className={cn("rounded-2xl border p-4", credit.state === "OVER" ? "border-rose-500/40 bg-rose-500/5" : credit.state === "NEAR" ? "border-amber-500/40 bg-amber-500/5" : "")}>
          <div className="flex items-center justify-between text-sm"><span className="font-medium">{t("credit.title")}</span><span className="tabular-nums text-muted-foreground">{m(credit.used)} / {m(credit.limit ?? 0)}</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={creditPct} aria-valuemin={0} aria-valuemax={100} aria-label={t("credit.title")}><div className={cn("h-full rounded-full", credit.state === "OVER" ? "bg-rose-500" : credit.state === "NEAR" ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${creditPct}%` }} /></div>
          {credit.state === "OVER" && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{t("credit.overBody")}</p>}
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto w-full justify-start overflow-x-auto">
          {(["overview", "invoices", "deals", "contacts", "notes", "activity"] as const).map((k) => <TabsTrigger key={k} value={k}>{t(`tabs.${k}` as never)}{k === "contacts" ? ` (${data.contacts.length})` : k === "notes" ? ` (${data.notes.length})` : ""}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border bg-card p-5 lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold">{t("details")}</h2>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Fact label={t("form.address")}>{client.address || "—"}</Fact>
              <Fact label={client.countryCode === "IN" ? "GSTIN" : t("form.taxId")}>{client.taxId || "—"}</Fact>
              <Fact label={t("form.taxTreatment")}>{client.isExport ? t("form.treatmentExport") : t("form.treatmentDomestic")}</Fact>
              <Fact label={t("form.industry")}>{client.industry || "—"}</Fact>
              <Fact label={t("form.currency")}>{client.currency || baseCurrency}</Fact>
              <Fact label={t("owner")}>{data.owner?.name || data.owner?.email || "—"}</Fact>
              <Fact label={t("since")}>{shortDate((client as unknown as { createdAt: string }).createdAt, locale)}</Fact>
              <Fact label={t("source")}>{t(`sources.${client.source}` as never)}</Fact>
            </dl>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">{t("tools")}</h2>
              <div className="grid gap-2">
                <Button asChild variant="outline" className="justify-start"><a href={`/api/clients/${id}/statement`}><Download className="mr-2 size-4" aria-hidden />{t("actions.statement")}</a></Button>
                <Button variant="outline" className="justify-start" onClick={() => setConfirm("archive")}>{archived ? <ArchiveRestore className="mr-2 size-4" aria-hidden /> : <Archive className="mr-2 size-4" aria-hidden />}{archived ? t("actions.restore") : t("actions.archive")}</Button>
                <Button variant="outline" className="justify-start text-rose-600 hover:text-rose-700" onClick={() => setConfirm("delete")}><Trash2 className="mr-2 size-4" aria-hidden />{t("actions.delete")}</Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <div className="overflow-hidden rounded-2xl border bg-card">
            {data.invoices.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">{t("invoicesEmpty")}</p> : (
              <ul>{data.invoices.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-0">
                  <Link href={`/income?invoiceId=${i.id}`} className="min-w-0 hover:underline"><span className="font-medium">{i.invoiceNumber}</span><span className="block text-xs text-muted-foreground">{shortDate(i.invoiceDate, locale)}{i.dueDate ? ` · ${t("due", { date: shortDate(i.dueDate, locale) })}` : ""}</span></Link>
                  <div className="text-end"><span className="font-medium tabular-nums">{money(i.grandTotal, i.currency, locale)}</span><span className={cn("block text-xs", STATUS_TONE[i.status])}>{i.status.replace("_", " ")}</span></div>
                </li>))}</ul>
            )}
          </div>
          <div className="mt-3 text-end"><Button asChild variant="link"><Link href={`/income?clientId=${id}`}>{t("allInvoices")}</Link></Button></div>
        </TabsContent>

        <TabsContent value="deals" className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{t("tabs.proposals")}</h2><Button asChild size="sm" variant="ghost"><Link href={`/proposals/new?client=${id}`}><Plus className="mr-1 size-4" aria-hidden />{t("actions.proposal")}</Link></Button></div>
            {data.proposals.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("none")}</p> : <ul className="space-y-2">{data.proposals.map((p) => <li key={p.id} className="flex justify-between gap-2 text-sm"><Link href={`/proposals/${p.id}`} className="min-w-0 truncate hover:underline">{p.proposalNo} · {p.title}</Link><Badge variant="outline">{p.status}</Badge></li>)}</ul>}
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{t("tabs.retainers")}</h2><Button asChild size="sm" variant="ghost"><Link href={`/retainers/new?client=${id}`}><Plus className="mr-1 size-4" aria-hidden />{t("actions.retainer")}</Link></Button></div>
            {data.retainers.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("none")}</p> : <ul className="space-y-2">{data.retainers.map((r) => <li key={r.id} className="flex justify-between gap-2 text-sm"><Link href={`/retainers/${r.id}/edit`} className="min-w-0 truncate hover:underline">{r.name || r.serviceName}{r.amount !== null ? ` · ${money(r.amount, r.currency, locale)}` : ""}</Link><Badge variant="outline">{r.status}</Badge></li>)}</ul>}
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">{t("contactsHelp")}</p>
          {data.contacts.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
              <div className="min-w-0"><p className="font-medium">{c.name}{c.isPrimary && <Badge className="ms-2" variant="secondary">{t("primary")}</Badge>}</p><p className="truncate text-xs text-muted-foreground">{[c.role, c.email, c.phone].filter(Boolean).join(" · ") || "—"}</p><p className="mt-1 text-xs text-muted-foreground">{c.receivesInvoices ? t("getsInvoices") : ""}{c.receivesInvoices && c.receivesReminders ? " · " : ""}{c.receivesReminders ? t("getsReminders") : ""}</p></div>
              <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setContactForm(c)}>{t("actions.edit")}</Button><Button size="sm" variant="ghost" aria-label={t("actions.delete")} onClick={() => void removeContact(c.id)}><Trash2 className="size-4" aria-hidden /></Button></div>
            </div>
          ))}
          {contactForm ? (
            <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
              <Input aria-label={t("contact.name")} placeholder={t("contact.name")} value={contactForm.name ?? ""} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
              <Input aria-label={t("contact.role")} placeholder={t("contact.role")} value={contactForm.role ?? ""} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} />
              <Input aria-label={t("form.email")} type="email" placeholder={t("form.email")} value={contactForm.email ?? ""} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
              <Input aria-label={t("form.phone")} type="tel" placeholder={t("form.phone")} value={contactForm.phone ?? ""} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
              <label className="flex items-center gap-2 text-sm"><Switch checked={Boolean(contactForm.isPrimary)} onCheckedChange={(v) => setContactForm({ ...contactForm, isPrimary: v })} />{t("primary")}</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={contactForm.receivesInvoices ?? true} onCheckedChange={(v) => setContactForm({ ...contactForm, receivesInvoices: v })} />{t("getsInvoices")}</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={contactForm.receivesReminders ?? true} onCheckedChange={(v) => setContactForm({ ...contactForm, receivesReminders: v })} />{t("getsReminders")}</label>
              <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="ghost" onClick={() => setContactForm(null)}>{t("form.cancel")}</Button><Button onClick={() => void saveContact()} disabled={busy || !contactForm.name?.trim()}>{t("form.save")}</Button></div>
            </div>
          ) : <Button variant="outline" onClick={() => setContactForm({ receivesInvoices: true, receivesReminders: true, isPrimary: data.contacts.length === 0 })}><Plus className="mr-2 size-4" aria-hidden />{t("contact.add")}</Button>}
        </TabsContent>

        <TabsContent value="notes" className="mt-4 space-y-3">
          <div className="rounded-2xl border bg-card p-4">
            <Textarea aria-label={t("notes.label")} placeholder={t("notes.placeholder")} rows={3} maxLength={4000} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            <div className="mt-2 flex justify-end"><Button onClick={() => void addNote()} disabled={busy || !noteText.trim()}>{busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}{t("notes.add")}</Button></div>
          </div>
          {data.notes.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("notes.empty")}</p> : data.notes.map((n) => (
            <article key={n.id} className={cn("rounded-2xl border bg-card p-4", n.pinned && "border-amber-500/40 bg-amber-500/5")}>
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{n.authorName} · {shortDate(n.createdAt, locale)}</span>
                <span className="flex gap-1"><Button size="sm" variant="ghost" aria-label={n.pinned ? t("notes.unpin") : t("notes.pin")} onClick={() => void noteAction(n.id, "PATCH", { pinned: !n.pinned })}><Pin className={cn("size-4", n.pinned && "fill-current")} aria-hidden /></Button><Button size="sm" variant="ghost" aria-label={t("actions.delete")} onClick={() => void noteAction(n.id, "DELETE")}><Trash2 className="size-4" aria-hidden /></Button></span></div>
            </article>
          ))}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ol className="relative space-y-4 border-s ps-5">
            {data.timeline.length === 0 && <p className="text-sm text-muted-foreground">{t("none")}</p>}
            {data.timeline.map((e, i) => (
              <li key={`${e.at}-${i}`} className="relative"><span className="absolute -start-[26px] top-1.5 size-2.5 rounded-full bg-indigo-500" aria-hidden />
                <p className="text-sm"><span className="font-medium">{t(`timeline.${e.type}` as never)}</span> · {e.title}{e.amount !== undefined && e.currency ? ` · ${money(e.amount, e.currency, locale)}` : ""}</p>
                <p className="text-xs text-muted-foreground">{shortDate(e.at, locale)}</p></li>
            ))}
          </ol>
        </TabsContent>
      </Tabs>

      <ClientFormDialog open={edit} onOpenChange={setEdit} client={asRow} workspaceCountry={workspaceCountry} locale={locale} onSaved={() => void load()} />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? t("confirm.deleteTitle", { name: client.name }) : archived ? t("confirm.restoreTitle") : t("confirm.archiveTitle", { name: client.name })}</AlertDialogTitle>
            <AlertDialogDescription>{confirm === "delete" ? t("confirm.deleteBody") : archived ? t("confirm.restoreBody") : t("confirm.archiveBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("form.cancel")}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => void (confirm === "delete" ? remove() : archiveToggle())}>{t("confirm.go")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
