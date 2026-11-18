import { getTranslations } from 'next-intl/server';
import { Server } from 'lucide-react';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { prisma } from '@/lib/prisma';
import { EmailBillingEmptyState, EmailBillingStatusBadge, EmailBillingTable, TruncatedText } from '@/components/email-billing/ui';
import { ServerDialog, ServerRowActions } from '@/components/email-billing/client-actions';
import { requireEmailBillingPage } from '../_data';
import { loadMailBillingSettings } from '@/lib/email-billing/settings';
import { formatDateTime } from '@/lib/email-billing/format';

export default async function ServersPage() {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const { allowMailboxManagement } = await loadMailBillingSettings(workspaceId);
  const servers = await prisma.mailBillingServer.findMany({
    where: { workspaceId },
    include: { _count: { select: { domains: true, mailboxes: true } }, syncRuns: { orderBy: { startedAt: 'desc' }, take: 5 } },
    orderBy: { createdAt: 'desc' },
  });
  const headers = ['name', 'provider', 'accessMode', 'baseUrl', 'status', 'lastSync', 'domains', 'mailboxes', 'lastError', 'token', 'actions'].map((k) => t(`tables.${k}`));
  return (
    <DashboardPageShell
      title={t('pages.serversTitle')}
      description={t('pages.serversSubtitle')}
      icon={<Server className="size-5" />}
      primaryAction={<ServerDialog triggerLabel={t('actions.addServer')} />}
    >
      {servers.length === 0 ? (
        <EmailBillingEmptyState title={t('empty.noServersTitle')} description={t('empty.noServersDescription')} />
      ) : (
        <EmailBillingTable headers={headers} caption={t('pages.serversTitle')}>
          {servers.map((server) => (
            <tr key={server.id} className="border-b hover:bg-muted/50">
              <td className="p-2 font-medium"><TruncatedText>{server.name}</TruncatedText></td>
              <td className="p-2">{server.provider}</td>
              <td className="p-2"><div className="flex flex-wrap items-center gap-1"><EmailBillingStatusBadge value={server.accessMode} />{server.writesEnabled ? <EmailBillingStatusBadge value="ACTIVE" label={t('ops.writesOn')} /> : null}</div></td>
              <td className="p-2"><TruncatedText className="max-w-[22rem]">{server.baseUrl}</TruncatedText></td>
              <td className="p-2"><EmailBillingStatusBadge value={server.status} /></td>
              <td className="p-2 whitespace-nowrap">{server.lastSyncAt ? formatDateTime(server.lastSyncAt) : t('labels.never')}</td>
              <td className="p-2">{server._count.domains}</td>
              <td className="p-2">{server._count.mailboxes}</td>
              <td className="p-2 text-muted-foreground"><TruncatedText>{server.lastSyncError ?? t('labels.notAvailable')}</TruncatedText></td>
              <td className="p-2"><EmailBillingStatusBadge value={server.encryptedToken ? 'ACTIVE' : 'DISABLED'} label={server.encryptedToken ? t('labels.tokenSet') : t('labels.tokenNotConfigured')} /></td>
              <td className="p-2"><ServerRowActions managementAllowed={allowMailboxManagement} server={{ id: server.id, name: server.name, baseUrl: server.baseUrl, accessMode: server.accessMode, status: server.status, hasToken: Boolean(server.encryptedToken), writesEnabled: server.writesEnabled, miabVersion: server.miabVersion }} /></td>
            </tr>
          ))}
        </EmailBillingTable>
      )}
      <p className="text-sm text-muted-foreground">{t('sections.tokenSafety')}</p>
    </DashboardPageShell>
  );
}
