'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ServerRow = {
  id: string;
  name: string;
  baseUrl: string;
  accessMode: string;
  status: string;
  hasToken: boolean;
};

type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  billingMode: string;
  currency: string;
  basePrice: string | number;
  includedMailboxes: number;
  extraMailboxPrice: string | number;
  frequency: string;
  isActive: boolean;
  sortOrder: number;
};

type SettingsShape = {
  defaultBillingMode: string;
  defaultCurrency: string;
  defaultPlanId: string | null;
  autoCreateReviewItems: boolean;
  autoUpdateRetainerQuantities: boolean;
  syncFrequencyPreference: string;
  treatRemovedDomainsAsReviewRequired: boolean;
  ignoreAdminMailboxesFromBilling: boolean;
  usageBillingPolicy?: string;
  prorateIncreases?: boolean;
};

async function postJson(url: string, body?: unknown, method = 'POST') {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Request failed');
  return data;
}

function Field({ id, label, children, error }: { id: string; label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p id={`${id}-error`} className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function ServerDialog({ server, triggerLabel }: { server?: ServerRow; triggerLabel: string }) {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearToken, setClearToken] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const token = String(form.get('token') ?? '').trim();
    const payload = {
      name: String(form.get('name') ?? '').trim(),
      baseUrl: String(form.get('baseUrl') ?? '').trim(),
      accessMode: String(form.get('accessMode') ?? 'READ_ONLY_ADAPTER'),
      status: String(form.get('status') ?? 'ACTIVE'),
      ...(token ? { token } : {}),
      ...(clearToken ? { clearToken: true } : {}),
    };
    try {
      await postJson(server ? `/api/email-billing/servers/${server.id}` : '/api/email-billing/servers', payload, server ? 'PATCH' : 'POST');
      toast.success(server ? t('toast.serverUpdated') : t('toast.serverCreated'));
      setOpen(false);
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : t('toast.requestFailed');
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant={server ? 'outline' : 'primary-action'} size="sm">{triggerLabel}</Button></DialogTrigger>
      <DialogContent aria-describedby="server-dialog-description">
        <DialogHeader>
          <DialogTitle>{server ? t('actions.editServer') : t('actions.addServer')}</DialogTitle>
          <DialogDescription id="server-dialog-description">{t('forms.serverDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null}
          <Field id="server-name" label={t('tables.name')}><Input id="server-name" name="name" defaultValue={server?.name ?? ''} required /></Field>
          <Field id="server-base-url" label={t('tables.baseUrl')}><Input id="server-base-url" name="baseUrl" type="url" defaultValue={server?.baseUrl ?? ''} required /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="server-access-mode" label={t('tables.accessMode')}>
              <Select name="accessMode" defaultValue={server?.accessMode ?? 'READ_ONLY_ADAPTER'}>
                <SelectTrigger id="server-access-mode" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="READ_ONLY_ADAPTER">READ_ONLY_ADAPTER</SelectItem><SelectItem value="DIRECT_MIAB_API">DIRECT_MIAB_API</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field id="server-status" label={t('tables.status')}>
              <Select name="status" defaultValue={server?.status ?? 'ACTIVE'}>
                <SelectTrigger id="server-status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ACTIVE">ACTIVE</SelectItem><SelectItem value="DISABLED">DISABLED</SelectItem><SelectItem value="ERROR">ERROR</SelectItem></SelectContent>
              </Select>
            </Field>
          </div>
          <Field id="server-token" label={`${t('tables.token')} (${server?.hasToken ? t('labels.tokenSet') : t('labels.tokenNotConfigured')})`}>
            <Input id="server-token" name="token" type="password" autoComplete="new-password" placeholder={server?.hasToken ? 'SET' : ''} />
          </Field>
          {server?.hasToken ? <label className="flex items-center gap-2 text-sm"><Checkbox checked={clearToken} onCheckedChange={(value) => setClearToken(value === true)} />{t('forms.clearTokenConfirm')}</label> : null}
          <DialogFooter><Button type="submit" disabled={submitting}>{submitting ? t('actions.saving') : t('actions.save')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ServerRowActions({ server }: { server: ServerRow }) {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(action: 'test' | 'sync') {
    setBusy(action);
    try {
      const data = await postJson(`/api/email-billing/servers/${server.id}/${action === 'test' ? 'test' : 'sync'}`);
      toast.success(action === 'test' ? t('toast.connectionOk') : t('toast.syncStarted'), { description: JSON.stringify(data).slice(0, 160) });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toast.requestFailed'));
    } finally {
      setBusy(null);
    }
  }
  return <div className="flex flex-wrap gap-2"><ServerDialog server={server} triggerLabel={t('actions.editServer')} /><Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => run('test')}>{t('actions.testConnection')}</Button><Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => run('sync')}>{t('actions.syncNow')}</Button></div>;
}

export function PlanDialog({ plan, triggerLabel }: { plan?: PlanRow; triggerLabel: string }) {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      await postJson(plan ? `/api/email-billing/plans/${plan.id}` : '/api/email-billing/plans', payload, plan ? 'PATCH' : 'POST');
      toast.success(plan ? t('toast.planUpdated') : t('toast.planCreated'));
      setOpen(false);
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : t('toast.requestFailed');
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant={plan ? 'outline' : 'primary-action'} size="sm">{triggerLabel}</Button></DialogTrigger>
      <DialogContent aria-describedby="plan-dialog-description">
        <DialogHeader><DialogTitle>{plan ? t('actions.editPlan') : t('actions.createPlan')}</DialogTitle><DialogDescription id="plan-dialog-description">{t('forms.planDescription')}</DialogDescription></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null}
          <Field id="plan-name" label={t('tables.name')}><Input id="plan-name" name="name" defaultValue={plan?.name ?? ''} required /></Field>
          <Field id="plan-description" label={t('tables.description')}><Input id="plan-description" name="description" defaultValue={plan?.description ?? ''} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="plan-mode" label={t('tables.billingMode')}><Select name="billingMode" defaultValue={plan?.billingMode ?? 'FIXED'}><SelectTrigger id="plan-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FIXED">FIXED</SelectItem><SelectItem value="PER_MAILBOX">PER_MAILBOX</SelectItem><SelectItem value="BUNDLE_PLUS_EXTRA">BUNDLE_PLUS_EXTRA</SelectItem><SelectItem value="MANUAL">MANUAL</SelectItem></SelectContent></Select></Field>
            <Field id="plan-frequency" label={t('tables.frequency')}><Select name="frequency" defaultValue={plan?.frequency ?? 'MONTHLY'}><SelectTrigger id="plan-frequency" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MONTHLY">MONTHLY</SelectItem><SelectItem value="QUARTERLY">QUARTERLY</SelectItem><SelectItem value="ANNUALLY">ANNUALLY</SelectItem></SelectContent></Select></Field>
            <Field id="plan-currency" label={t('tables.currency')}><Input id="plan-currency" name="currency" defaultValue={plan?.currency ?? 'INR'} required maxLength={3} /></Field>
            <Field id="plan-base" label={t('tables.basePrice')}><Input id="plan-base" name="basePrice" type="number" min="0" step="0.01" defaultValue={String(plan?.basePrice ?? 0)} required /></Field>
            <Field id="plan-included" label={t('tables.includedMailboxes')}><Input id="plan-included" name="includedMailboxes" type="number" min="0" step="1" defaultValue={String(plan?.includedMailboxes ?? 0)} /></Field>
            <Field id="plan-extra" label={t('tables.extraMailboxPrice')}><Input id="plan-extra" name="extraMailboxPrice" type="number" min="0" step="0.01" defaultValue={String(plan?.extraMailboxPrice ?? 0)} /></Field>
          </div>
          <DialogFooter><Button type="submit" disabled={submitting}>{submitting ? t('actions.saving') : t('actions.save')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlanRowActions({ plan }: { plan: PlanRow }) {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  async function deactivate() {
    if (!window.confirm(t('forms.deactivatePlanConfirm'))) return;
    try {
      await postJson(`/api/email-billing/plans/${plan.id}/deactivate`);
      toast.success(t('toast.planDeactivated'));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toast.requestFailed'));
    }
  }
  return <div className="flex flex-wrap gap-2"><PlanDialog plan={plan} triggerLabel={t('actions.editPlan')} /><Button type="button" variant="outline" size="sm" disabled={!plan.isActive} onClick={deactivate}>{t('actions.deactivatePlan')}</Button></div>;
}

export function ReviewItemActions({ item }: { item: { id: string; type?: string; domainId: string | null; subscriptionId: string | null } }) {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  async function apply(url: string, body?: unknown) {
    try {
      await postJson(url, body);
      toast.success(t('toast.reviewUpdated'));
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : t('toast.requestFailed')); }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {item.domainId ? <Button asChild variant="outline" size="sm"><Link href={`/email-billing/domains/${item.domainId}`}>{t('actions.openDomain')}</Link></Button> : null}
      <Button type="button" variant="outline" size="sm" onClick={() => apply(`/api/email-billing/review/${item.id}/resolve`)}>{t('actions.resolve')}</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => apply(`/api/email-billing/review/${item.id}/dismiss`)}>{t('actions.dismiss')}</Button>
      {item.domainId ? <Button type="button" variant="outline" size="sm" onClick={() => apply(`/api/email-billing/review/${item.id}/apply`, { action: 'IGNORE_DOMAIN' })}>{t('actions.ignoreDomain')}</Button> : null}
      {item.type === 'MAILBOX_COUNT_CHANGED' && item.subscriptionId ? <Button type="button" size="sm" onClick={() => apply(`/api/email-billing/review/${item.id}/apply`, { action: 'APPLY_MAILBOX_COUNT' })}>{t('actions.applyMailboxCount')}</Button> : null}
      {item.subscriptionId ? <Button type="button" variant="outline" size="sm" onClick={() => apply(`/api/email-billing/review/${item.id}/apply`, { action: 'PAUSE_SUBSCRIPTION' })}>{t('actions.pauseSubscription')}</Button> : null}
      {item.domainId ? <Button asChild variant="outline" size="sm"><Link href={`/email-billing/domains/${item.domainId}#billing`}>{t('actions.createSubscription')}</Link></Button> : null}
    </div>
  );
}

export function SettingsForm({ settings, plans }: { settings: SettingsShape; plans: Array<{ id: string; name: string }> }) {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      defaultBillingMode: String(form.get('defaultBillingMode')),
      defaultCurrency: String(form.get('defaultCurrency')),
      defaultPlanId: ['', 'none'].includes(String(form.get('defaultPlanId') || '')) ? null : String(form.get('defaultPlanId')),
      autoCreateReviewItems: form.get('autoCreateReviewItems') === 'on',
      autoUpdateRetainerQuantities: form.get('autoUpdateRetainerQuantities') === 'on',
      syncFrequencyPreference: String(form.get('syncFrequencyPreference')),
      treatRemovedDomainsAsReviewRequired: form.get('treatRemovedDomainsAsReviewRequired') === 'on',
      ignoreAdminMailboxesFromBilling: form.get('ignoreAdminMailboxesFromBilling') === 'on',
      usageBillingPolicy: String(form.get('usageBillingPolicy') || 'LATEST'),
      prorateIncreases: form.get('prorateIncreases') === 'on',
    };
    try {
      await postJson('/api/email-billing/settings', payload, 'PATCH');
      toast.success(t('toast.settingsSaved'));
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : t('toast.requestFailed');
      setError(message);
      toast.error(message);
    }
  }
  const booleanFields = useMemo(() => ['autoCreateReviewItems', 'autoUpdateRetainerQuantities', 'treatRemovedDomainsAsReviewRequired', 'ignoreAdminMailboxesFromBilling', 'prorateIncreases'] as const, []);
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="settings-mode" label={t('tables.billingMode')}><Select name="defaultBillingMode" defaultValue={settings.defaultBillingMode}><SelectTrigger id="settings-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FIXED">FIXED</SelectItem><SelectItem value="PER_MAILBOX">PER_MAILBOX</SelectItem><SelectItem value="BUNDLE_PLUS_EXTRA">BUNDLE_PLUS_EXTRA</SelectItem><SelectItem value="MANUAL">MANUAL</SelectItem></SelectContent></Select></Field>
        <Field id="settings-currency" label={t('tables.currency')}><Input id="settings-currency" name="defaultCurrency" defaultValue={settings.defaultCurrency} maxLength={3} required /></Field>
        <Field id="settings-plan" label={t('tables.plan')}><Select name="defaultPlanId" defaultValue={settings.defaultPlanId ?? 'none'}><SelectTrigger id="settings-plan" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t('labels.none')}</SelectItem>{plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field id="settings-sync" label={t('settingsLabels.syncFrequencyPreference')}><Select name="syncFrequencyPreference" defaultValue={settings.syncFrequencyPreference}><SelectTrigger id="settings-sync" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MANUAL">MANUAL</SelectItem><SelectItem value="DAILY">DAILY</SelectItem><SelectItem value="WEEKLY">WEEKLY</SelectItem></SelectContent></Select></Field>
        <Field id="settings-policy" label={t('settingsLabels.usageBillingPolicy')}><Select name="usageBillingPolicy" defaultValue={settings.usageBillingPolicy ?? 'LATEST'}><SelectTrigger id="settings-policy" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="LATEST">{t('settingsLabels.policyLatest')}</SelectItem><SelectItem value="HIGH_WATER_MARK">{t('settingsLabels.policyHighWaterMark')}</SelectItem></SelectContent></Select></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {booleanFields.map((field) => <label key={field} className="flex items-center gap-2 rounded-lg border border-border/70 p-3 text-sm"><Checkbox name={field} defaultChecked={field === 'prorateIncreases' ? settings.prorateIncreases !== false : Boolean(settings[field])} />{t(`settingsLabels.${field}`)}</label>)}
      </div>
      <Button type="submit">{t('actions.saveSettings')}</Button>
    </form>
  );
}

export function DomainFilters() {
  const t = useTranslations('EmailBilling');
  const params = useSearchParams();
  const current = params.get('filter') ?? 'all';
  const filters = ['all', 'unmapped', 'missingBilling', 'reviewRequired', 'active', 'removed', 'ignored'];
  return <div className="flex flex-wrap gap-2" aria-label={t('labels.filters')}>{filters.map((filter) => <Button key={filter} asChild size="sm" variant={current === filter ? 'primary-action' : 'outline'}><Link href={`/email-billing/domains?filter=${filter}`}>{t(`filters.${filter}`)}</Link></Button>)}</div>;
}

export function DomainRowActions({ domainId }: { domainId: string }) {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  async function ignore() {
    try { await postJson(`/api/email-billing/domains/${domainId}/ignore`); toast.success(t('toast.domainIgnored')); router.refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : t('toast.requestFailed')); }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="icon-sm" aria-label={t('actions.domainActions')}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('tables.actions')}</DropdownMenuLabel>
        <DropdownMenuItem asChild><Link href={`/email-billing/domains/${domainId}`}>{t('actions.view')}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href={`/email-billing/domains/${domainId}#billing`}>{t('actions.createSubscription')}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href={`/email-billing/domains/${domainId}#billing`}>{t('actions.createRetainer')}</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={ignore}>{t('actions.ignoreDomain')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
