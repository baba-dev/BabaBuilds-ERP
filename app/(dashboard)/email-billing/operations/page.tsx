import { getTranslations } from 'next-intl/server';
import { History } from 'lucide-react';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { prisma } from '@/lib/prisma';
import { EmailBillingEmptyState, EmailBillingStatusBadge, EmailBillingTable, TruncatedText } from '@/components/email-billing/ui';
import { OperationRowActions } from '@/components/email-billing/mailbox-manager';
import { requireEmailBillingPage } from '../_data';
import { formatDateTime } from '@/lib/email-billing/format';

export default async function OperationsPage() {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const operations = await prisma.mailOperation.findMany({
    where: { workspaceId },
    include: { mailbox: { select: { email: true } }, domain: { select: { domain: true } }, server: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const headers = ['time', 'type', 'target', 'status', 'source', 'error', 'actions'].map((k) => t(`ops.columns.${k}`));
  return (
    <DashboardPageShell title={t('ops.title')} description={t('ops.subtitle')} icon={<History className="size-5" />}>
      {operations.length === 0 ? (
        <EmailBillingEmptyState title={t('ops.emptyTitle')} description={t('ops.emptyDescription')} />
      ) : (
        <EmailBillingTable headers={headers} caption={t('ops.title')}>
          {operations.map((op) => {
            const target = op.mailbox?.email ?? (op.payloadJson as { email?: string; address?: string } | null)?.email ?? (op.payloadJson as { address?: string } | null)?.address ?? op.domain?.domain ?? op.server.name;
            return (
              <tr key={op.id} className="border-b hover:bg-muted/50">
                <td className="p-2 whitespace-nowrap">{formatDateTime(op.createdAt)}</td>
                <td className="p-2">{t(`ops.types.${op.type}`)}</td>
                <td className="p-2"><TruncatedText>{target}</TruncatedText></td>
                <td className="p-2">
                  <EmailBillingStatusBadge value={op.status} />
                  {op.status === 'PENDING' && op.runAfter > new Date() ? <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(op.runAfter)}</span> : null}
                </td>
                <td className="p-2">{op.source}</td>
                <td className="p-2 text-muted-foreground"><TruncatedText>{op.errorMessage ?? t('labels.none')}</TruncatedText></td>
                <td className="p-2"><OperationRowActions operation={{ id: op.id, status: op.status, type: op.type }} /></td>
              </tr>
            );
          })}
        </EmailBillingTable>
      )}
    </DashboardPageShell>
  );
}
