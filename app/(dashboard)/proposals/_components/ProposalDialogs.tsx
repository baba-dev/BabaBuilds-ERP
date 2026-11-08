"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { ProposalDetailDto, ProposalListItemDto } from "@/lib/proposals/types";
import { formatMoney, readApiError } from "./proposal-utils";
import { useJson } from "./use-proposals-data";

type Common = { onDone: () => void; onClose: () => void };
type Target = ProposalListItemDto | null;

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return res;
}

/* ───────────────────────── Send / remind ───────────────────────── */

export function SendProposalDialog({ proposal, onDone, onClose }: Common & { proposal: Target }) {
  return proposal ? <SendBody key={proposal.id} proposal={proposal} onDone={onDone} onClose={onClose} /> : null;
}

function SendBody({ proposal, onDone, onClose }: Common & { proposal: ProposalListItemDto }) {
  const t = useTranslations("ProposalsHub.send");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isReminder = proposal.status !== "DRAFT";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await call(`/api/proposals/${proposal.id}/send`, "POST", message.trim() ? { message: message.trim() } : {});
      if (!res.ok) {
        setError(await readApiError(res, t("failed")));
        return;
      }
      toast.success(isReminder ? t("reminderSuccess") : t("success"));
      onDone();
      onClose();
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isReminder ? t("reminderTitle") : t("title")}</DialogTitle>
            <DialogDescription>{t("description", { client: proposal.clientName, number: proposal.proposalNo })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="send-message">{t("message")}</Label>
            <Textarea id="send-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={4} placeholder={t("messagePlaceholder")} />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary-action" disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {isReminder ? t("sendReminder") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Decline / record acceptance / reopen ───────────────────────── */

export function DeclineProposalDialog({ proposal, onDone, onClose }: Common & { proposal: Target }) {
  return proposal ? <DeclineBody key={proposal.id} proposal={proposal} onDone={onDone} onClose={onClose} /> : null;
}

function DeclineBody({ proposal, onDone, onClose }: Common & { proposal: ProposalListItemDto }) {
  const t = useTranslations("ProposalsHub.decline");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await call(`/api/proposals/${proposal.id}/status`, "PATCH", { status: "DECLINED", note: note.trim() || undefined });
      if (!res.ok) {
        setError(await readApiError(res, t("failed")));
        return;
      }
      toast.success(t("success"));
      onDone();
      onClose();
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description", { number: proposal.proposalNo })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="decline-note">{t("reason")}</Label>
            <Textarea id="decline-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder={t("reasonPlaceholder")} />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecordAcceptanceDialog({ proposal, onDone, onClose }: Common & { proposal: Target }) {
  const t = useTranslations("ProposalsHub.accept");
  const [busy, setBusy] = useState(false);
  if (!proposal) return null;
  const run = async () => {
    setBusy(true);
    try {
      const res = await call(`/api/proposals/${proposal.id}/status`, "PATCH", { status: "ACCEPTED" });
      if (!res.ok) {
        toast.error(await readApiError(res, t("failed")));
        return;
      }
      toast.success(t("success"));
      onDone();
      onClose();
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("description", { client: proposal.clientName, number: proposal.proposalNo })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("submit")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ───────────────────────── Convert to invoice ───────────────────────── */

export function ConvertProposalDialog({ proposal, locale, onDone, onClose }: Common & { proposal: Target; locale: string }) {
  return proposal ? <ConvertBody key={proposal.id} proposal={proposal} locale={locale} onDone={onDone} onClose={onClose} /> : null;
}

function ConvertBody({ proposal, locale, onDone, onClose }: Common & { proposal: ProposalListItemDto; locale: string }) {
  const t = useTranslations("ProposalsHub.convert");
  const detail = useJson<{ data: ProposalDetailDto }>(`/api/proposals/${proposal.id}`);
  const data = detail.data?.data ?? null;
  const [createRetainer, setCreateRetainer] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = data ? data.items.filter((i) => !i.isOptional || i.isSelected) : [];
  const skipped = data ? data.items.filter((i) => i.isOptional && !i.isSelected) : [];
  const recurring = lines.filter((i) => i.isRecurring);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await call(`/api/proposals/${proposal.id}/convert`, "POST", { createRetainer: recurring.length > 0 && createRetainer });
      const payload = (await res.json().catch(() => null)) as { error?: string; alreadyConverted?: boolean; invoice?: { invoiceNumber: string } } | null;
      if (!res.ok || !payload?.invoice) {
        setError(payload?.error || t("failed"));
        return;
      }
      toast.success(payload.alreadyConverted ? t("already", { number: payload.invoice.invoiceNumber }) : t("success", { number: payload.invoice.invoiceNumber }));
      onDone();
      onClose();
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { number: proposal.proposalNo, client: proposal.clientName })}</DialogDescription>
        </DialogHeader>

        {detail.loading && !data ? (
          <Skeleton className="h-32 w-full" />
        ) : data ? (
          <div className="space-y-4">
            <ul className="divide-y divide-border/60 rounded-xl border border-border/70 text-sm">
              {lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{l.title}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {l.quantity} × {formatMoney(l.unitPrice, data.currency, locale)}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatMoney(l.total, data.currency, locale)}</span>
                </li>
              ))}
            </ul>
            {skipped.length > 0 && <p className="text-xs text-muted-foreground">{t("skipped", { count: skipped.length })}</p>}
            <dl className="space-y-1 text-sm tabular-nums">
              <div className="flex justify-between"><dt className="text-muted-foreground">{t("subtotal")}</dt><dd>{formatMoney(data.subtotal, data.currency, locale)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">{t("tax", { rate: data.taxRatePercent })}</dt><dd>{formatMoney(data.estimatedTax, data.currency, locale)}</dd></div>
              <div className="flex justify-between text-base font-bold"><dt>{t("total")}</dt><dd>{formatMoney(data.totalAmount, data.currency, locale)}</dd></div>
            </dl>
            {recurring.length > 0 && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
                <input type="checkbox" checked={createRetainer} onChange={(e) => setCreateRetainer(e.target.checked)} className="mt-0.5 size-4 rounded border-border accent-indigo-600" />
                <span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Repeat className="size-4 text-indigo-600" aria-hidden /> {t("retainer", { count: recurring.length })}
                  </span>
                  <span className="text-xs text-muted-foreground">{t("retainerHint")}</span>
                </span>
              </label>
            )}
            <p className="text-xs text-muted-foreground">{t("note")}</p>
          </div>
        ) : (
          <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-700 dark:text-rose-300">
            {detail.error ?? t("failed")}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-700 dark:text-rose-300">
            {error}{" "}
            {error.toLowerCase().includes("limit") && (
              <Link href="/settings/billing" className="underline">
                {t("upgrade")}
              </Link>
            )}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="button" variant="primary-action" onClick={submit} disabled={busy || !data} className="gap-1.5">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Delete / archive ───────────────────────── */

export function DeleteProposalDialog({ proposal, onDone, onClose }: Common & { proposal: Target }) {
  return proposal ? <DeleteBody key={proposal.id} proposal={proposal} onDone={onDone} onClose={onClose} /> : null;
}

function DeleteBody({ proposal, onDone, onClose }: Common & { proposal: ProposalListItemDto }) {
  const t = useTranslations("ProposalsHub.delete");
  const [busy, setBusy] = useState(false);
  const [mustArchive, setMustArchive] = useState(proposal.status === "ACCEPTED" || proposal.status === "INVOICED");

  const run = async () => {
    setBusy(true);
    try {
      if (mustArchive) {
        const res = await call(`/api/proposals/${proposal.id}`, "PATCH", { archived: true });
        if (!res.ok) {
          toast.error(await readApiError(res, t("failed")));
          return;
        }
        toast.success(t("archived"));
      } else {
        const res = await call(`/api/proposals/${proposal.id}`, "DELETE");
        if (!res.ok) {
          const payload = (await res.clone().json().catch(() => null)) as { archivable?: boolean } | null;
          if (payload?.archivable) {
            setMustArchive(true);
            return;
          }
          toast.error(await readApiError(res, t("failed")));
          return;
        }
        toast.success(t("deleted"));
      }
      onDone();
      onClose();
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{mustArchive ? t("archiveTitle") : t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{mustArchive ? t("archiveDescription", { number: proposal.proposalNo }) : t("description", { number: proposal.proposalNo })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {mustArchive ? t("archive") : t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
