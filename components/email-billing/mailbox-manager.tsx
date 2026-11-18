'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type Op = { type: string } & Record<string, unknown>;
type Outcome = { operation: { status: string; errorMessage?: string | null }; secret?: { password: string } };

async function requestOperation(body: Op): Promise<Outcome> {
  const response = await fetch('/api/email-billing/operations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Request failed');
  if (data?.operation?.status === 'FAILED') throw new Error(data.operation.errorMessage ?? 'Operation failed');
  return data as Outcome;
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null;
}

/**
 * Runs an operation and keeps any one-time password only in component state. It is shown once in SecretDialog and is
 * dropped when that dialog closes; it is never put in a URL, storage or a toast.
 */
function useOperation() {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);

  async function run(body: Op, email: string, onDone?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const result = await requestOperation(body);
      toast.success(result.operation.status === 'PENDING' ? t('ops.toast.scheduled') : t('ops.toast.done'));
      if (result.secret) setSecret({ email, password: result.secret.password });
      onDone?.();
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : t('ops.toast.failed');
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run, secret, clearSecret: () => setSecret(null) };
}

function SecretDialog({ secret, onClose }: { secret: { email: string; password: string } | null; onClose: () => void }) {
  const t = useTranslations('EmailBilling');
  return (
    <Dialog open={secret !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-describedby="mailbox-secret-description">
        <DialogHeader>
          <DialogTitle>{t('ops.secretTitle')}</DialogTitle>
          <DialogDescription id="mailbox-secret-description">{t('ops.secretWarning')}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{secret?.email}</p>
        <code className="block select-all break-all rounded-lg border border-border/70 bg-muted p-3 font-mono text-sm" data-testid="mailbox-secret">{secret?.password}</code>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { void navigator.clipboard?.writeText(secret?.password ?? '').then(() => toast.success(t('ops.copied'))); }}>{t('ops.copy')}</Button>
          <Button type="button" onClick={onClose}>{t('ops.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateMailboxDialog({ domain, enabled }: { domain: string; enabled: boolean }) {
  const t = useTranslations('EmailBilling');
  const [open, setOpen] = useState(false);
  const op = useOperation();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = `${String(form.get('local') ?? '').trim().toLowerCase()}@${domain}`;
    const quota = String(form.get('quota') ?? '').trim();
    await op.run({ type: 'MAILBOX_CREATE', email, ...(quota ? { quotaMb: Number(quota) } : {}) }, email, () => setOpen(false));
  }
  return (
    <>
      <Button type="button" size="sm" disabled={!enabled} title={enabled ? undefined : t('ops.writesOff')} onClick={() => { op.setError(null); setOpen(true); }}>{t('ops.createMailbox')}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="create-mailbox-description">
          <DialogHeader><DialogTitle>{t('ops.createMailbox')}</DialogTitle><DialogDescription id="create-mailbox-description">{t('ops.createHelp')}</DialogDescription></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <ErrorLine error={op.error} />
            <Field id="mailbox-local" label={t('ops.mailboxName')}>
              <div className="flex items-center gap-2">
                <Input id="mailbox-local" name="local" required maxLength={64} pattern="[A-Za-z0-9]([A-Za-z0-9._+\-]*[A-Za-z0-9])?" autoComplete="off" />
                <span className="whitespace-nowrap text-sm text-muted-foreground">@{domain}</span>
              </div>
            </Field>
            <Field id="mailbox-quota" label={t('ops.quota')}><Input id="mailbox-quota" name="quota" type="number" min={0} step={1} inputMode="numeric" /></Field>
            <DialogFooter><Button type="submit" disabled={op.busy}>{op.busy ? t('actions.saving') : t('ops.create')}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SecretDialog secret={op.secret} onClose={op.clearSecret} />
    </>
  );
}

/** Onboards a new customer domain: the mail server adds a domain when its first mailbox is created. */
export function AddDomainDialog({ servers }: { servers: Array<{ id: string; name: string }> }) {
  const t = useTranslations('EmailBilling');
  const [open, setOpen] = useState(false);
  const [serverId, setServerId] = useState(servers[0]?.id ?? '');
  const op = useOperation();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const domain = String(form.get('domain') ?? '').trim().toLowerCase();
    const email = `${String(form.get('local') ?? '').trim().toLowerCase()}@${domain}`;
    const quota = String(form.get('quota') ?? '').trim();
    await op.run({ type: 'MAILBOX_CREATE', newDomain: true, serverId, email, ...(quota ? { quotaMb: Number(quota) } : {}) }, email, () => setOpen(false));
  }
  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={servers.length === 0} title={servers.length === 0 ? t('ops.writesOff') : undefined} onClick={() => { op.setError(null); setOpen(true); }}>{t('ops.addDomain')}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="add-domain-description">
          <DialogHeader><DialogTitle>{t('ops.addDomain')}</DialogTitle><DialogDescription id="add-domain-description">{t('ops.addDomainHelp')}</DialogDescription></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <ErrorLine error={op.error} />
            {servers.length > 1 ? (
              <Field id="new-domain-server" label={t('tables.server')}>
                <Select value={serverId} onValueChange={setServerId}><SelectTrigger id="new-domain-server" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{servers.map((sv) => <SelectItem key={sv.id} value={sv.id}>{sv.name}</SelectItem>)}</SelectContent></Select>
              </Field>
            ) : null}
            <Field id="new-domain-name" label={t('tables.domain')}><Input id="new-domain-name" name="domain" required maxLength={253} placeholder="example.com" autoComplete="off" /></Field>
            <Field id="new-domain-local" label={t('ops.firstMailbox')}><Input id="new-domain-local" name="local" required maxLength={64} defaultValue="admin" autoComplete="off" /></Field>
            <Field id="new-domain-quota" label={t('ops.quota')}><Input id="new-domain-quota" name="quota" type="number" min={0} step={1} inputMode="numeric" /></Field>
            <p className="text-xs text-muted-foreground">{t('ops.addDomainDns')}</p>
            <DialogFooter><Button type="submit" disabled={op.busy || !serverId}>{op.busy ? t('actions.saving') : t('ops.create')}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SecretDialog secret={op.secret} onClose={op.clearSecret} />
    </>
  );
}

export function AddAliasDialog({ domainId, domain, enabled }: { domainId: string; domain: string; enabled: boolean }) {
  const t = useTranslations('EmailBilling');
  const [open, setOpen] = useState(false);
  const op = useOperation();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const address = `${String(form.get('local') ?? '').trim().toLowerCase()}@${domain}`;
    const forwardsTo = String(form.get('forwardsTo') ?? '').split(/[\n,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    await op.run({ type: 'ALIAS_ADD', domainId, address, forwardsTo }, address, () => setOpen(false));
  }
  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={!enabled} title={enabled ? undefined : t('ops.writesOff')} onClick={() => { op.setError(null); setOpen(true); }}>{t('ops.addAlias')}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="add-alias-description">
          <DialogHeader><DialogTitle>{t('ops.addAlias')}</DialogTitle><DialogDescription id="add-alias-description">{t('ops.aliasHelp')}</DialogDescription></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <ErrorLine error={op.error} />
            <Field id="alias-local" label={t('ops.aliasAddress')}>
              <div className="flex items-center gap-2"><Input id="alias-local" name="local" required maxLength={64} autoComplete="off" /><span className="whitespace-nowrap text-sm text-muted-foreground">@{domain}</span></div>
            </Field>
            <Field id="alias-forwards" label={t('ops.forwardsTo')}><Textarea id="alias-forwards" name="forwardsTo" required rows={3} /></Field>
            <DialogFooter><Button type="submit" disabled={op.busy}>{op.busy ? t('actions.saving') : t('ops.create')}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type MailboxProps = { id: string; email: string; isAdmin: boolean; suspendedAt: string | null; deleteScheduledFor: string | null };
type Panel = 'reset' | 'quota' | 'suspend' | 'delete' | null;

export function MailboxActions({ mailbox, enabled, canDelete }: { mailbox: MailboxProps; enabled: boolean; canDelete: boolean }) {
  const t = useTranslations('EmailBilling');
  const [panel, setPanel] = useState<Panel>(null);
  const op = useOperation();
  const suspended = mailbox.suspendedAt !== null;
  const close = () => setPanel(null);
  const open = (next: Panel) => { op.setError(null); setPanel(next); };

  async function onQuota(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quota = Number(new FormData(event.currentTarget).get('quota'));
    await op.run({ type: 'QUOTA_SET', mailboxId: mailbox.id, quotaMb: quota }, mailbox.email, close);
  }
  async function onSuspend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    await op.run({ type: 'MAILBOX_SUSPEND', mailboxId: mailbox.id, ...(reason ? { reason } : {}) }, mailbox.email, close);
  }
  async function onDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await op.run({ type: 'MAILBOX_DELETE', mailboxId: mailbox.id, confirmEmail: String(form.get('confirm') ?? '').trim().toLowerCase(), delayDays: Number(form.get('delay') ?? 7) }, mailbox.email, close);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {suspended ? <span className="rounded-md border border-border/70 px-1.5 py-0.5 text-xs text-muted-foreground">{t('ops.suspended')}</span> : null}
        {mailbox.deleteScheduledFor ? <span className="rounded-md border border-destructive/40 px-1.5 py-0.5 text-xs text-destructive">{t('ops.scheduledDelete', { date: new Date(mailbox.deleteScheduledFor).toLocaleDateString() })}</span> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" disabled={!enabled} aria-label={`${t('tables.actions')}: ${mailbox.email}`} title={enabled ? undefined : t('ops.writesOff')}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => open('quota')}>{t('ops.setQuota')}</DropdownMenuItem>
            {!mailbox.isAdmin ? <DropdownMenuItem onSelect={() => open('reset')}>{t('ops.resetPassword')}</DropdownMenuItem> : null}
            {!mailbox.isAdmin && !suspended ? <DropdownMenuItem onSelect={() => open('suspend')}>{t('ops.suspend')}</DropdownMenuItem> : null}
            {!mailbox.isAdmin && suspended ? <DropdownMenuItem onSelect={() => void op.run({ type: 'MAILBOX_RESUME', mailboxId: mailbox.id }, mailbox.email)}>{t('ops.resume')}</DropdownMenuItem> : null}
            {canDelete && !mailbox.isAdmin ? <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => open('delete')}>{t('ops.delete')}</DropdownMenuItem></> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={panel === 'quota'} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent aria-describedby="quota-description">
          <DialogHeader><DialogTitle>{t('ops.setQuota')}</DialogTitle><DialogDescription id="quota-description">{mailbox.email}</DialogDescription></DialogHeader>
          <form onSubmit={onQuota} className="space-y-4"><ErrorLine error={op.error} /><Field id="quota-value" label={t('ops.quota')}><Input id="quota-value" name="quota" type="number" min={0} step={1} required /></Field><DialogFooter><Button type="submit" disabled={op.busy}>{t('actions.save')}</Button></DialogFooter></form>
        </DialogContent>
      </Dialog>

      <Dialog open={panel === 'reset'} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent aria-describedby="reset-description">
          <DialogHeader><DialogTitle>{t('ops.resetPassword')}</DialogTitle><DialogDescription id="reset-description">{t('ops.resetHelp', { email: mailbox.email })}</DialogDescription></DialogHeader>
          <ErrorLine error={op.error} />
          <DialogFooter><Button type="button" disabled={op.busy} onClick={() => void op.run({ type: 'PASSWORD_RESET', mailboxId: mailbox.id }, mailbox.email, close)}>{t('ops.resetPassword')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={panel === 'suspend'} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent aria-describedby="suspend-description">
          <DialogHeader><DialogTitle>{t('ops.suspend')}</DialogTitle><DialogDescription id="suspend-description">{t('ops.suspendHelp', { email: mailbox.email })}</DialogDescription></DialogHeader>
          <form onSubmit={onSuspend} className="space-y-4"><ErrorLine error={op.error} /><Field id="suspend-reason" label={t('ops.reason')}><Input id="suspend-reason" name="reason" maxLength={200} /></Field><DialogFooter><Button type="submit" disabled={op.busy}>{t('ops.suspend')}</Button></DialogFooter></form>
        </DialogContent>
      </Dialog>

      <Dialog open={panel === 'delete'} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent aria-describedby="delete-description">
          <DialogHeader><DialogTitle>{t('ops.delete')}</DialogTitle><DialogDescription id="delete-description">{t('ops.deleteHelp', { email: mailbox.email })}</DialogDescription></DialogHeader>
          <form onSubmit={onDelete} className="space-y-4">
            <ErrorLine error={op.error} />
            <Field id="delete-confirm" label={t('ops.confirmDelete')}><Input id="delete-confirm" name="confirm" required autoComplete="off" placeholder={mailbox.email} /></Field>
            <Field id="delete-delay" label={t('ops.deleteWindow')}><Input id="delete-delay" name="delay" type="number" min={0} max={30} step={1} defaultValue={7} required /></Field>
            <DialogFooter><Button type="submit" variant="destructive" disabled={op.busy}>{t('ops.delete')}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SecretDialog secret={op.secret} onClose={op.clearSecret} />
    </>
  );
}

/** Cancel (waiting operations, including a scheduled delete) and retry (failed, non-password operations). */
export function OperationRowActions({ operation }: { operation: { id: string; status: string; type: string } }) {
  const t = useTranslations('EmailBilling');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const retryable = operation.status === 'FAILED' && !['MAILBOX_CREATE', 'PASSWORD_RESET', 'MAILBOX_RESUME'].includes(operation.type);

  async function act(kind: 'cancel' | 'retry') {
    setBusy(true);
    try {
      const response = await fetch(`/api/email-billing/operations/${operation.id}/${kind}`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Request failed');
      toast.success(t('ops.toast.done'));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('ops.toast.failed'));
    } finally {
      setBusy(false);
    }
  }
  if (operation.status === 'PENDING') return <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act('cancel')}>{operation.type === 'MAILBOX_DELETE' ? t('ops.cancelDelete') : t('ops.cancel')}</Button>;
  if (retryable) return <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act('retry')}>{t('ops.retry')}</Button>;
  return null;
}
