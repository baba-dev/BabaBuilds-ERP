'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'] as const;
type Method = (typeof METHODS)[number];

async function send(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(typeof data.error === 'string' ? data.error : 'Request failed'), { code: data.code as string | undefined });
  return data;
}

const Field = ({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) => (
  <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>
);
const ErrorLine = ({ error }: { error: string | null }) => (error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null);

function MethodSelect({ id, value, onChange }: { id: string; value: Method; onChange: (m: Method) => void }) {
  const t = useTranslations('EmailBilling');
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Method)}>
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{t(`balances.methods.${m}`)}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/**
 * Collect what the client owes up to the date on the statement. The total shown is sent with the request, so if anything
 * changed since the statement was drawn up the server refuses instead of invoicing a different amount.
 */
export function CollectDialog({ clientId, clientName, asOf, total, currency, addresses, canRecordPayment }: {
  clientId: string; clientName: string; asOf: string; total: number; currency: string; addresses: number; canRecordPayment: boolean;
}) {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(canRecordPayment);
  const [method, setMethod] = useState<Method>('CASH');
  const [done, setDone] = useState<{ invoiceNumber: string | null; invoiceTotal: number | null; paid: boolean; paymentError: string | null } | null>(null);
  // One key per opened dialog: a double click or a retry after a lost connection can never collect twice.
  const key = useRef<string>('');
  const money = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);

  function show() { key.current = crypto.randomUUID(); setError(null); setDone(null); setOpen(true); }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const data = await send(`/api/email-billing/collections/clients/${clientId}/collect`, {
        asOf, currency, idempotencyKey: key.current, expectedTotal: total,
        ...(paid && canRecordPayment ? { payment: { method, reference: String(form.get('reference') ?? '').trim() || null } } : {}),
      });
      const c = data.collection;
      setDone({ invoiceNumber: c.invoice?.invoiceNumber ?? null, invoiceTotal: c.invoice?.total ?? null, paid: c.payment?.ok === true, paymentError: c.payment && !c.payment.ok ? c.payment.message : null });
      toast.success(t('balances.collected'));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('toast.requestFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={show} disabled={total <= 0}>{t('balances.collect')}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="collect-description">
          <DialogHeader>
            <DialogTitle>{t('balances.collectTitle', { client: clientName })}</DialogTitle>
            <DialogDescription id="collect-description">{t('balances.collectHelp', { amount: money(total), date: new Date(asOf).toLocaleDateString(), count: addresses })}</DialogDescription>
          </DialogHeader>
          {done ? (
            <div className="space-y-3 text-sm" aria-live="polite">
              <p className="font-medium">{t('balances.invoiceCreated', { number: done.invoiceNumber ?? '' })}</p>
              {done.invoiceTotal !== null ? <p>{t('balances.invoiceTotal', { amount: money(done.invoiceTotal) })}</p> : null}
              <p>{done.paid ? t('balances.paymentRecorded') : t('balances.paymentNotRecorded')}</p>
              {done.paymentError ? <p className="text-destructive">{done.paymentError}</p> : null}
              <DialogFooter><Button type="button" variant="outline" asChild><Link href="/income">{t('balances.openInvoices')}</Link></Button><Button type="button" onClick={() => setOpen(false)}>{t('ops.done')}</Button></DialogFooter>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <ErrorLine error={error} />
              <p className="rounded-lg border border-border/70 bg-muted p-3 text-sm">{t('balances.collectNote')}</p>
              {canRecordPayment ? (
                <div className="space-y-3">
                  <label className="flex items-start gap-2 text-sm"><Checkbox checked={paid} onCheckedChange={(v) => setPaid(v === true)} className="mt-0.5" />{t('balances.paidNow')}</label>
                  {paid ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field id="collect-method" label={t('balances.method')}><MethodSelect id="collect-method" value={method} onChange={setMethod} /></Field>
                      <Field id="collect-ref" label={t('balances.reference')}><Input id="collect-ref" name="reference" maxLength={120} /></Field>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <DialogFooter><Button type="submit" disabled={busy}>{busy ? t('actions.saving') : t('balances.confirmCollect', { amount: money(total) })}</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The opening position for addresses that existed before the ERP: when charging starts, or what was already paid up to. */
export function OpeningDatesDialog({ scope, label, defaultDate }: { scope: { clientId: string } | { domainId: string }; label: string; defaultDate: string }) {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<'chargingStart' | 'collectedThrough'>('chargingStart');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const date = String(new FormData(event.currentTarget).get('date') ?? '');
    setBusy(true);
    setError(null);
    try {
      const data = await send('/api/email-billing/collections/dates', { kind, scope, date });
      toast.success(t('balances.datesApplied', { count: data.changed }));
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('toast.requestFailed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => { setError(null); setOpen(true); }}>{label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="dates-description">
          <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription id="dates-description">{t('balances.datesHelp')}</DialogDescription></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <ErrorLine error={error} />
            <fieldset className="space-y-2">
              <label className="flex items-start gap-2 text-sm"><input type="radio" name="kind" className="mt-1" checked={kind === 'chargingStart'} onChange={() => setKind('chargingStart')} />{t('balances.kindStart')}</label>
              <label className="flex items-start gap-2 text-sm"><input type="radio" name="kind" className="mt-1" checked={kind === 'collectedThrough'} onChange={() => setKind('collectedThrough')} />{t('balances.kindPaid')}</label>
            </fieldset>
            <Field id="dates-date" label={t('balances.date')} hint={kind === 'chargingStart' ? t('balances.kindStartHint') : t('balances.kindPaidHint')}><Input id="dates-date" name="date" type="date" required defaultValue={defaultDate} /></Field>
            <DialogFooter><Button type="submit" disabled={busy}>{busy ? t('actions.saving') : t('balances.apply')}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** What can still be done to a past collection: finish it, record the money, or undo it. */
export function CollectionActions({ collection, canPay, canUndo, canFinish, isLatest }: {
  collection: { id: string; status: string; invoiceStatus: string | null; currency: string };
  canPay: boolean; canUndo: boolean; canFinish: boolean; isLatest: boolean;
}) {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'pay' | 'undo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('CASH');

  async function run(url: string, body: unknown, done: string) {
    setBusy(true);
    setError(null);
    try {
      await send(url, body);
      toast.success(done);
      setPanel(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('toast.requestFailed'));
    } finally {
      setBusy(false);
    }
  }
  const unpaid = collection.status === 'INVOICED' && (collection.invoiceStatus === 'PENDING' || collection.invoiceStatus === 'PARTIALLY_PAID');

  return (
    <div className="flex flex-wrap gap-2">
      {collection.status === 'INVOICING' && canFinish ? <Button type="button" size="sm" disabled={busy} onClick={() => void run(`/api/email-billing/collections/${collection.id}/recover`, {}, t('balances.finished'))}>{t('balances.finish')}</Button> : null}
      {unpaid && canPay ? <Button type="button" size="sm" variant="outline" onClick={() => { setError(null); setPanel('pay'); }}>{t('balances.recordPayment')}</Button> : null}
      {collection.status === 'INVOICED' && isLatest && canUndo ? <Button type="button" size="sm" variant="outline" onClick={() => { setError(null); setPanel('undo'); }}>{t('balances.undo')}</Button> : null}

      <Dialog open={panel === 'pay'} onOpenChange={(o) => { if (!o) setPanel(null); }}>
        <DialogContent aria-describedby="pay-description">
          <DialogHeader><DialogTitle>{t('balances.recordPayment')}</DialogTitle><DialogDescription id="pay-description">{t('balances.recordPaymentHelp')}</DialogDescription></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); void run(`/api/email-billing/collections/${collection.id}/payment`, { method, reference: String(new FormData(e.currentTarget).get('reference') ?? '').trim() || null }, t('balances.paymentRecorded')); }} className="space-y-4">
            <ErrorLine error={error} />
            <Field id="late-method" label={t('balances.method')}><MethodSelect id="late-method" value={method} onChange={setMethod} /></Field>
            <Field id="late-ref" label={t('balances.reference')}><Input id="late-ref" name="reference" maxLength={120} /></Field>
            <DialogFooter><Button type="submit" disabled={busy}>{t('balances.recordPayment')}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={panel === 'undo'} onOpenChange={(o) => { if (!o) setPanel(null); }}>
        <DialogContent aria-describedby="undo-description">
          <DialogHeader><DialogTitle>{t('balances.undo')}</DialogTitle><DialogDescription id="undo-description">{t('balances.undoHelp')}</DialogDescription></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); void run(`/api/email-billing/collections/${collection.id}/undo`, { reason: String(new FormData(e.currentTarget).get('reason') ?? '').trim() }, t('balances.undone')); }} className="space-y-4">
            <ErrorLine error={error} />
            <Field id="undo-reason" label={t('balances.undoReason')}><Input id="undo-reason" name="reason" required minLength={3} maxLength={300} /></Field>
            <DialogFooter><Button type="submit" variant="destructive" disabled={busy}>{t('balances.undo')}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
