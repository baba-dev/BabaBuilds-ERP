'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type PlanOption = { id: string; name: string; frequency: string; currency: string };
type ClientHit = { id: string; name: string; email: string | null };

async function send(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(typeof data.error === 'string' ? data.error : 'Request failed'), { data });
  return data;
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>;
}
const ErrorLine = ({ error }: { error: string | null }) => (error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null);

function PlanSelect({ id, plans, value, onChange }: { id: string; plans: PlanOption[]; value: string; onChange: (id: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.frequency.toLowerCase()} · {p.currency}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/** Search-as-you-type client lookup. Searches on the server because the customer list can be very large. */
function ClientPicker({ value, onPick }: { value: ClientHit | null; onPick: (client: ClientHit | null) => void }) {
  const t = useTranslations('EmailBilling');
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onSearch(text: string) {
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/clients?picker=1&limit=8&q=${encodeURIComponent(text.trim())}`);
        const data = await response.json().catch(() => ({}));
        setHits(Array.isArray(data.data) ? data.data.map((c: ClientHit) => ({ id: c.id, name: c.name, email: c.email })) : []);
      } finally {
        setSearching(false);
      }
    }, 250);
  }
  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border/70 p-2 text-sm">
        <span>{value.name}{value.email ? <span className="text-muted-foreground"> · {value.email}</span> : null}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onPick(null)}>{t('billingSetup.change')}</Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Input id="setup-client-search" type="search" autoComplete="off" placeholder={t('billingSetup.searchClients')} onChange={(e) => onSearch(e.target.value)} />
      {searching ? <p className="text-xs text-muted-foreground">{t('billingSetup.searching')}</p> : null}
      {hits.length ? <ul className="max-h-40 overflow-auto rounded-lg border border-border/70 text-sm" role="listbox">{hits.map((hit) => (
        <li key={hit.id}><button type="button" className="w-full px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted" onClick={() => { setHits([]); onPick(hit); }}>{hit.name}{hit.email ? <span className="text-muted-foreground"> · {hit.email}</span> : null}</button></li>
      ))}</ul> : null}
    </div>
  );
}

const day = (value: string | Date) => (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);

export function SetupBillingDialog({ domainId, domain, plans, defaultPlanId, issuedOn, currentClient, canCreateClients, accrual = false }: {
  accrual?: boolean;
  domainId: string; domain: string; plans: PlanOption[]; defaultPlanId?: string | null; issuedOn: string;
  currentClient?: ClientHit | null; canCreateClients: boolean;
}) {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientHit | null>(currentClient ?? null);
  const [creating, setCreating] = useState(false);
  const [planId, setPlanId] = useState(defaultPlanId ?? plans[0]?.id ?? '');
  const [emailInvoices, setEmailInvoices] = useState(true);
  const [duplicates, setDuplicates] = useState<ClientHit[]>([]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDuplicates([]);
    const form = new FormData(event.currentTarget);
    const trial = Number(form.get('trialDays') || 0);
    const first = String(form.get('firstBillingDate') || '');
    const body = {
      planId,
      ...(creating ? { newClient: { name: String(form.get('newName') ?? '').trim(), email: String(form.get('newEmail') ?? '').trim() } } : { clientId: client?.id }),
      startDate: String(form.get('startDate') || issuedOn),
      ...(trial > 0 ? { trialDays: trial } : {}),
      // Accrual billing has no first invoice date and no scheduled invoices to email.
      ...(first && !accrual ? { firstBillingDate: first } : {}),
      ...(accrual ? {} : { emailInvoices }),
    };
    setBusy(true);
    try {
      const data = await send(`/api/email-billing/domains/${domainId}/setup-billing`, body);
      const date = data.result?.firstBillingDate ? new Date(data.result.firstBillingDate).toLocaleDateString() : null;
      toast.success(date ? t('billingSetup.doneWithDate', { date }) : t('billingSetup.done'));
      setOpen(false);
      router.refresh();
    } catch (e) {
      const err = e as Error & { data?: { code?: string; existing?: ClientHit[] } };
      setError(err.message);
      if (err.data?.code === 'CLIENT_DUPLICATE' && err.data.existing) setDuplicates(err.data.existing);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" disabled={plans.length === 0} title={plans.length === 0 ? t('billingSetup.needPlan') : undefined} onClick={() => { setError(null); setOpen(true); }}>{t('billingSetup.open')}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="setup-billing-description">
          <DialogHeader><DialogTitle>{t('billingSetup.title', { domain })}</DialogTitle><DialogDescription id="setup-billing-description">{accrual ? t('billingSetup.accrualHelp') : t('billingSetup.help')}</DialogDescription></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <ErrorLine error={error} />
            {duplicates.length ? <div className="space-y-1 text-sm">{duplicates.map((d) => <button key={d.id} type="button" className="block w-full rounded-lg border border-border/70 px-3 py-2 text-left hover:bg-muted" onClick={() => { setClient(d); setCreating(false); setDuplicates([]); setError(null); }}>{t('billingSetup.useExisting', { name: d.name })}</button>)}</div> : null}
            {creating ? (
              <div className="space-y-3">
                <Field id="setup-new-name" label={t('billingSetup.newClientName')}><Input id="setup-new-name" name="newName" required maxLength={160} defaultValue={domain} /></Field>
                <Field id="setup-new-email" label={t('billingSetup.newClientEmail')} hint={t('billingSetup.newClientEmailHint')}><Input id="setup-new-email" name="newEmail" type="email" maxLength={254} /></Field>
                <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>{t('billingSetup.pickExisting')}</Button>
              </div>
            ) : (
              <Field id="setup-client-search" label={t('billingSetup.client')}>
                <ClientPicker value={client} onPick={setClient} />
                {canCreateClients && !client ? <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(true)}>{t('billingSetup.newClient')}</Button> : null}
              </Field>
            )}
            <Field id="setup-plan" label={t('billingSetup.plan')}><PlanSelect id="setup-plan" plans={plans} value={planId} onChange={setPlanId} /></Field>
            <Field id="setup-start" label={t('billingSetup.issuedOn')} hint={t('billingSetup.issuedOnHint')}><Input id="setup-start" name="startDate" type="date" required defaultValue={day(issuedOn)} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="setup-trial" label={t('billingSetup.trialDays')}><Input id="setup-trial" name="trialDays" type="number" min={0} max={365} step={1} defaultValue={0} /></Field>
              {accrual ? null : <Field id="setup-first" label={t('billingSetup.firstBillingDate')} hint={t('billingSetup.firstBillingDateHint')}><Input id="setup-first" name="firstBillingDate" type="date" /></Field>}
            </div>
            {accrual ? null : <label className="flex items-start gap-2 text-sm"><Checkbox checked={emailInvoices} onCheckedChange={(v) => setEmailInvoices(v === true)} className="mt-0.5" />{t('billingSetup.emailInvoices')}</label>}
            <DialogFooter><Button type="submit" disabled={busy || (!creating && !client) || !planId}>{busy ? t('actions.saving') : t('billingSetup.submit')}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Preview = { eligible: number; unmappedSkipped: number; willProcessNow: number; sample: Array<{ domain: string; client: string | null; startDate: string; firstBillingDate: string | null; amount: number; currency: string }> };
type Applied = { processed: number; succeeded: number; failed: number; remaining: number; results: Array<{ domain: string; ok: boolean; error?: string }> };

export function BulkSetupDialog({ plans, defaultPlanId, canCreateClients, accrual = false }: { plans: PlanOption[]; defaultPlanId?: string | null; canCreateClients: boolean; accrual?: boolean }) {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState(defaultPlanId ?? plans[0]?.id ?? '');
  const [source, setSource] = useState<'DISCOVERED' | 'DATE'>('DISCOVERED');
  const [date, setDate] = useState('');
  const [createClients, setCreateClients] = useState(false);
  const [emailInvoices, setEmailInvoices] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);

  const payload = (mode: 'preview' | 'apply') => ({ mode, planId, startDateSource: source, ...(source === 'DATE' ? { startDate: date } : {}), createClients, emailInvoices: accrual ? false : emailInvoices });
  const reset = () => { setPreview(null); setApplied(null); setError(null); };

  async function run(mode: 'preview' | 'apply') {
    setBusy(true);
    setError(null);
    try {
      const data = await send('/api/email-billing/billing/bulk-setup', payload(mode));
      if (mode === 'preview') { setPreview(data.preview); setApplied(null); } else { setApplied(data.applied); setPreview(null); router.refresh(); }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('toast.requestFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={plans.length === 0} title={plans.length === 0 ? t('billingSetup.needPlan') : undefined} onClick={() => { reset(); setOpen(true); }}>{t('bulkSetup.open')}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="bulk-setup-description" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('bulkSetup.title')}</DialogTitle><DialogDescription id="bulk-setup-description">{t('bulkSetup.help')}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <ErrorLine error={error} />
            <Field id="bulk-plan" label={t('billingSetup.plan')}><PlanSelect id="bulk-plan" plans={plans} value={planId} onChange={(v) => { setPlanId(v); reset(); }} /></Field>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t('bulkSetup.startFrom')}</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="bulk-source" checked={source === 'DISCOVERED'} onChange={() => { setSource('DISCOVERED'); reset(); }} />{t('bulkSetup.fromDiscovered')}</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="bulk-source" checked={source === 'DATE'} onChange={() => { setSource('DATE'); reset(); }} />{t('bulkSetup.fromDate')}</label>
              {source === 'DATE' ? <Input aria-label={t('bulkSetup.fromDate')} type="date" value={date} onChange={(e) => { setDate(e.target.value); reset(); }} required /> : null}
            </fieldset>
            {canCreateClients ? <label className="flex items-start gap-2 text-sm"><Checkbox checked={createClients} onCheckedChange={(v) => { setCreateClients(v === true); reset(); }} className="mt-0.5" />{t('bulkSetup.createClients')}</label> : null}
            {accrual ? <p className="rounded-lg border border-border/70 bg-muted p-2 text-xs">{t('bulkSetup.accrualPreviewNote')}</p> : <label className="flex items-start gap-2 text-sm"><Checkbox checked={emailInvoices} onCheckedChange={(v) => { setEmailInvoices(v === true); reset(); }} className="mt-0.5" />{t('bulkSetup.emailInvoices')}</label>}
            {!accrual && emailInvoices ? <p className="rounded-lg border border-border/70 bg-muted p-2 text-xs">{t('bulkSetup.emailWarning')}</p> : null}

            {preview ? (
              <div className="space-y-2 text-sm" aria-live="polite">
                <p>{t('bulkSetup.previewSummary', { eligible: preview.eligible, now: preview.willProcessNow })}</p>
                {preview.unmappedSkipped > 0 ? <p className="text-muted-foreground">{t('bulkSetup.skipped', { count: preview.unmappedSkipped })}</p> : null}
                <ul className="max-h-48 divide-y overflow-auto rounded-lg border border-border/70">{preview.sample.map((r) => (
                  <li key={r.domain} className="px-3 py-2"><span className="font-medium">{r.domain}</span> · {r.client ?? '—'} · {t('bulkSetup.from')} {r.startDate}{accrual ? '' : ` · ${t('bulkSetup.firstInvoice')} ${r.firstBillingDate ?? '—'}`} · {r.currency} {r.amount}{accrual ? ` ${t('bulkSetup.perMonth')}` : ''}</li>
                ))}</ul>
              </div>
            ) : null}
            {applied ? (
              <div className="space-y-2 text-sm" aria-live="polite">
                <p>{t('bulkSetup.appliedSummary', { ok: applied.succeeded, failed: applied.failed, remaining: applied.remaining })}</p>
                {applied.results.filter((r) => !r.ok).slice(0, 10).map((r) => <p key={r.domain} className="text-destructive">{r.domain}: {r.error}</p>)}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy || !planId || (source === 'DATE' && !date)} onClick={() => void run('preview')}>{t('bulkSetup.preview')}</Button>
            <Button type="button" disabled={busy || !preview || preview.eligible === 0} onClick={() => void run('apply')}>{busy ? t('actions.saving') : t('bulkSetup.apply', { count: preview?.willProcessNow ?? 0 })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
