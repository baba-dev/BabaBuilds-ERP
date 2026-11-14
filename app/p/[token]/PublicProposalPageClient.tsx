"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, FileText, Hourglass, Loader2, MessageSquareText, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignatureCanvas } from "@/components/ui/signature-canvas";
import { cn } from "@/lib/utils";
import type { PublicProposalDto } from "@/lib/proposals/types";

function money(amount: number | string, currency: string, locale: string) {
  const value = Number(amount);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function day(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

function daysLeft(iso: string) {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((Date.parse(iso) - today) / 86_400_000);
}

async function errorOf(res: Response, fallback: string) {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    /* not JSON */
  }
  return fallback;
}

export default function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("PublicProposal");
  const locale = useLocale();

  const [proposal, setProposal] = useState<PublicProposalDto | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing">("loading");
  const [optionalOff, setOptionalOff] = useState<Set<string>>(new Set());

  const [acceptOpen, setAcceptOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/p/${encodeURIComponent(token)}`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) {
          setLoadState("missing");
          return;
        }
        const data = (await res.json()) as { proposal: PublicProposalDto };
        setProposal(data.proposal);
        setOptionalOff(new Set(data.proposal.items.filter((i) => i.isOptional && !i.isSelected).map((i) => i.id)));
        setLoadState("ready");
      } catch (e) {
        if ((e as { name?: string }).name !== "AbortError") setLoadState("missing");
      }
    })();
    return () => controller.abort();
  }, [token]);

  /* Telemetry: one VIEW, then dwell heartbeats per section (unchanged contract with /api/proposals/[id]/telemetry). */
  const proposalId = proposal?.id;
  useEffect(() => {
    if (!proposalId) return;
    const post = (sectionTitle: string, dwellTimeSeconds: number, eventType: "VIEW" | "HEARTBEAT") =>
      fetch(`/api/proposals/${proposalId}/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, sectionTitle, dwellTimeSeconds, eventType }),
        keepalive: true,
      }).catch(() => null);
    void post("Cover Pitch", 0, "VIEW");

    let active = "Cover Pitch";
    let since = Date.now();
    const flush = () => {
      const ms = Date.now() - since;
      if (ms >= 1500) void post(active, Math.round(ms / 1000), "HEARTBEAT");
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const name = entry.target.getAttribute("data-section-name");
          if (entry.isIntersecting && name && name !== active) {
            flush();
            active = name;
            since = Date.now();
          }
        }
      },
      { rootMargin: "-20% 0px -20% 0px", threshold: 0.1 },
    );
    document.querySelectorAll("[data-section-name]").forEach((el) => observer.observe(el));
    return () => {
      flush();
      observer.disconnect();
    };
  }, [proposalId, token]);

  const totals = useMemo(() => {
    if (!proposal) return null;
    const lines = proposal.items.filter((i) => !i.isOptional || !optionalOff.has(i.id));
    const allKept = lines.length === proposal.items.length;
    const stored = { subtotal: Number(proposal.subtotal), tax: Number(proposal.estimatedTax), total: Number(proposal.totalAmount) };
    if (allKept) return { ...stored, lines };
    const subtotal = Math.round(lines.reduce((a, l) => a + Number(l.total), 0) * 100) / 100;
    const tax = Math.round(subtotal * proposal.taxRatePercent) / 100;
    return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100, lines };
  }, [proposal, optionalOff]);

  if (loadState === "loading") {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-10" aria-busy>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
        <p className="sr-only">{t("loading")}</p>
      </main>
    );
  }

  if (loadState === "missing" || !proposal || !totals) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <FileText className="size-12 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-bold">{t("unavailable.title")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("unavailable.description")}</p>
      </main>
    );
  }

  const p = proposal;
  const c = p.currency;
  const fmt = (v: number | string) => money(v, c, locale);
  const remaining = daysLeft(p.validUntil);
  const expired = p.displayStatus === "EXPIRED";
  const accepted = p.status === "ACCEPTED" || p.status === "INVOICED";
  const declined = p.status === "DECLINED";
  const actionable = !accepted && !declined && !expired;
  const awaitingRevision = p.status === "REVISION_REQUESTED";
  const scale = Number(p.totalAmount) > 0 ? totals.total / Number(p.totalAmount) : 1;

  const toggleOptional = (id: string) =>
    setOptionalOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const accept = async () => {
    if (busy) return;
    setFormError("");
    if (!email.trim()) return setFormError(t("accept.emailRequired"));
    if (!signature) return setFormError(t("accept.signatureRequired"));
    if (!agree) return setFormError(t("accept.agreeRequired"));
    setBusy(true);
    try {
      const res = await fetch(`/api/p/${encodeURIComponent(token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          signerName: signerName.trim() || undefined,
          selectedItemIds: p.items.filter((i) => !i.isOptional || !optionalOff.has(i.id)).map((i) => i.id),
          signatureBase64: signature,
        }),
      });
      if (!res.ok) {
        setFormError(await errorOf(res, t("accept.failed")));
        return;
      }
      setProposal({ ...p, status: "ACCEPTED", displayStatus: "ACCEPTED", acceptedAt: new Date().toISOString(), subtotal: totals.subtotal.toFixed(2), estimatedTax: totals.tax.toFixed(2), totalAmount: totals.total.toFixed(2) });
      setAcceptOpen(false);
      toast.success(t("accept.success"));
    } catch {
      setFormError(t("accept.failed"));
    } finally {
      setBusy(false);
    }
  };

  const sendFeedback = async (status: "REVISION_REQUESTED" | "DECLINED") => {
    if (busy) return;
    if (!note.trim()) return setFormError(t("changes.noteRequired"));
    setFormError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/p/${encodeURIComponent(token)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, clientNote: note.trim() }),
      });
      if (!res.ok) {
        setFormError(await errorOf(res, t("changes.failed")));
        return;
      }
      setProposal({ ...p, status, displayStatus: status, hasRevisionRequest: status === "REVISION_REQUESTED" });
      setChangesOpen(false);
      toast.success(status === "DECLINED" ? t("changes.declinedToast") : t("changes.sentToast"));
    } catch {
      setFormError(t("changes.failed"));
    } finally {
      setBusy(false);
    }
  };

  const banner = accepted
    ? { tone: "emerald", icon: CheckCircle2, title: t("state.acceptedTitle"), body: t("state.acceptedBody", { date: p.acceptedAt ? day(p.acceptedAt, locale) : "" }) }
    : declined
      ? { tone: "rose", icon: XCircle, title: t("state.declinedTitle"), body: t("state.declinedBody") }
      : expired
        ? { tone: "orange", icon: AlertTriangle, title: t("state.expiredTitle"), body: t("state.expiredBody", { name: p.business.name }) }
        : awaitingRevision
          ? { tone: "amber", icon: Hourglass, title: t("state.revisionTitle"), body: t("state.revisionBody", { name: p.business.name }) }
          : null;
  const tone: Record<string, string> = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200",
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-900 dark:text-orange-200",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-32 sm:pb-16">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {p.business.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote tenant logo, size unknown
              <img src={p.business.logoUrl} alt="" className="size-8 shrink-0 rounded-lg object-contain" />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white" aria-hidden>
                {p.business.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-sm font-semibold">{p.business.name}</span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden /> {t("secure")}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-10">
        <section data-section-name="Cover Pitch" className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />
          <div className="space-y-4 p-5 sm:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">{t("proposalFor", { client: p.clientName })}</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{p.title}</h1>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">{t("reference")}</dt>
                <dd className="font-mono font-medium">{p.proposalNo}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("validUntil")}</dt>
                <dd className="font-medium">{day(p.validUntil, locale)}</dd>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <dt className="text-xs text-muted-foreground">{t("investment")}</dt>
                <dd className="text-xl font-bold tabular-nums">{fmt(totals.total)}</dd>
              </div>
            </dl>
            {actionable && remaining >= 0 && remaining <= 7 && (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <Clock className="size-3.5" aria-hidden /> {remaining === 0 ? t("expiresToday") : t("expiresIn", { days: remaining })}
              </p>
            )}
          </div>
        </section>

        {banner && (
          <div role="status" className={cn("flex items-start gap-3 rounded-2xl border p-4", tone[banner.tone])}>
            <banner.icon className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{banner.title}</p>
              <p className="text-sm opacity-90">{banner.body}</p>
            </div>
          </div>
        )}

        {p.richSections.length > 0 && (
          <section data-section-name="Highlights" className="space-y-3 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-8">
            <h2 className="text-lg font-bold">{t("highlights")}</h2>
            {p.richSections.map((s, idx) => (
              <div key={`${s.title}-${idx}`} className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <h3 className="text-sm font-bold">{s.title}</h3>
                {s.body && <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{s.body}</p>}
                {s.mediaUrl && (
                  <a href={s.mediaUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                    {t("viewMedia")}
                  </a>
                )}
              </div>
            ))}
          </section>
        )}

        {p.richMedia.length > 0 && (
          <section data-section-name="Media" className="space-y-3 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-8">
            <h2 className="text-lg font-bold">{t("media")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {p.richMedia.map((m, i) =>
                m.type === "video" ? (
                  <video key={i} src={m.url} controls preload="none" className="aspect-video w-full rounded-xl bg-black" aria-label={m.title || undefined} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- remote tenant media
                  <img key={i} src={m.url} alt={m.title} loading="lazy" className="w-full rounded-xl border border-border/60 object-cover" />
                ),
              )}
            </div>
          </section>
        )}

        <section data-section-name="Scope & Deliverables" className="space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-8">
          <div>
            <h2 className="text-lg font-bold">{t("scope")}</h2>
            {p.items.some((i) => i.isOptional) && actionable && <p className="text-sm text-muted-foreground">{t("optionalHint")}</p>}
          </div>
          <ul className="space-y-2.5">
            {p.items.map((item) => {
              const off = item.isOptional && optionalOff.has(item.id);
              const locked = !actionable;
              return (
                <li key={item.id} className={cn("flex items-start gap-3 rounded-xl border p-3.5 transition-opacity", off ? "border-dashed opacity-55" : "border-border/70")}>
                  {item.isOptional && (
                    <input
                      type="checkbox"
                      checked={!off}
                      disabled={locked}
                      onChange={() => toggleOptional(item.id)}
                      aria-label={t("includeItem", { title: item.title })}
                      className="mt-1 size-5 shrink-0 cursor-pointer rounded border-border accent-indigo-600 disabled:cursor-default"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-semibold", off && "line-through")}>
                      {item.title}
                      {item.isOptional && <span className="ms-2 rounded bg-indigo-500/10 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">{t("optionalTag")}</span>}
                    </p>
                    {item.description && <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>}
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {item.quantity} × {fmt(item.unitPrice)}
                    </p>
                  </div>
                  <p className={cn("shrink-0 font-semibold tabular-nums", off && "line-through")}>{fmt(item.total)}</p>
                </li>
              );
            })}
          </ul>
          <dl className="space-y-1.5 border-t border-border/60 pt-4 text-sm tabular-nums">
            <div className="flex justify-between"><dt className="text-muted-foreground">{t("subtotal")}</dt><dd>{fmt(totals.subtotal)}</dd></div>
            {p.taxRatePercent > 0 && (
              <div className="flex justify-between"><dt className="text-muted-foreground">{p.taxLabel} ({p.taxRatePercent}%)</dt><dd>{fmt(totals.tax)}</dd></div>
            )}
            <div className="flex justify-between text-lg font-black"><dt>{t("total")}</dt><dd>{fmt(totals.total)}</dd></div>
          </dl>
        </section>

        {p.milestones.length > 0 && (
          <section data-section-name="Payment Schedule" className="space-y-3 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-8">
            <h2 className="flex items-center gap-2 text-lg font-bold"><CalendarClock className="size-5 text-indigo-600" aria-hidden /> {t("schedule")}</h2>
            <ol className="space-y-2">
              {p.milestones.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.title}</span>
                    {m.dueDate && <span className="text-xs text-muted-foreground">{day(m.dueDate, locale)}</span>}
                  </span>
                  <span className="font-semibold tabular-nums">{fmt(Number(m.amount) * scale)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {actionable && (
          <section data-section-name="Decision" className="hidden space-y-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-5 sm:block sm:p-8">
            <h2 className="text-lg font-bold">{t("decision.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("decision.body")}</p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" variant="primary-action" className="h-12 gap-2 rounded-xl px-6 font-semibold" onClick={() => setAcceptOpen(true)}>
                <CheckCircle2 className="size-4" aria-hidden /> {t("decision.accept")}
              </Button>
              <Button size="lg" variant="outline" className="h-12 gap-2 rounded-xl" onClick={() => setChangesOpen(true)}>
                <MessageSquareText className="size-4" aria-hidden /> {t("decision.changes")}
              </Button>
            </div>
          </section>
        )}
      </main>

      {actionable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{t("total")}</p>
              <p className="truncate text-lg font-bold tabular-nums">{fmt(totals.total)}</p>
            </div>
            <Button variant="outline" className="h-12 rounded-xl" onClick={() => setChangesOpen(true)} aria-label={t("decision.changes")}>
              <MessageSquareText className="size-4" aria-hidden />
            </Button>
            <Button variant="primary-action" className="h-12 rounded-xl px-5 font-semibold" onClick={() => setAcceptOpen(true)}>
              {t("decision.accept")}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={acceptOpen} onOpenChange={(open) => !busy && setAcceptOpen(open)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("accept.title")}</DialogTitle>
            <DialogDescription>{t("accept.description", { total: fmt(totals.total) })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pp-email">{t("accept.email")}</Label>
              <Input id="pp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("accept.emailPlaceholder")} className="h-11" />
              <p className="text-xs text-muted-foreground">{t("accept.emailHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-name">{t("accept.name")}</Label>
              <Input id="pp-name" autoComplete="name" value={signerName} onChange={(e) => setSignerName(e.target.value)} maxLength={120} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("accept.signature")}</Label>
              <SignatureCanvas onSave={setSignature} onClear={() => setSignature("")} />
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 rounded border-border accent-indigo-600" />
              <span>{t("accept.agree", { total: fmt(totals.total), business: p.business.name })}</span>
            </label>
            {formError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-700 dark:text-rose-300">{formError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAcceptOpen(false)} disabled={busy}>{t("cancel")}</Button>
            <Button variant="primary-action" onClick={accept} disabled={busy} className="gap-2">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("accept.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changesOpen} onOpenChange={(open) => !busy && setChangesOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("changes.title")}</DialogTitle>
            <DialogDescription>{t("changes.description", { name: p.business.name })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pp-note">{t("changes.note")}</Label>
            <Textarea id="pp-note" value={note} onChange={(e) => setNote(e.target.value)} rows={5} maxLength={2000} placeholder={t("changes.placeholder")} />
            {formError && <p role="alert" className="text-sm text-rose-600">{formError}</p>}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => sendFeedback("DECLINED")} disabled={busy}>
              {t("changes.decline")}
            </Button>
            <Button variant="primary-action" onClick={() => sendFeedback("REVISION_REQUESTED")} disabled={busy} className="gap-2">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("changes.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
