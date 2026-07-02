import { getTranslations } from 'next-intl/server';
import { AlertTriangle } from 'lucide-react';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { prisma } from '@/lib/prisma';
import { EmailBillingEmptyState, EmailBillingPanel, EmailBillingStatusBadge } from '@/components/email-billing/ui';
import { ReviewItemActions } from '@/components/email-billing/client-actions';
import { requireEmailBillingPage } from '../_data';

export default async function ReviewPage() {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const items = await prisma.mailBillingReviewItem.findMany({ where: { workspaceId }, include: { domain: { include: { client: true } }, server: true }, orderBy: [{ status: 'asc' }, { severity: 'desc' }, { createdAt: 'desc' }] });
  const open = items.filter((item) => item.status === 'OPEN');
  const severityGroups = ['CRITICAL', 'WARNING', 'INFO'].map((severity) => ({ severity, items: open.filter((item) => item.severity === severity) })).filter((group) => group.items.length > 0);
  return (
    <DashboardPageShell title={t('pages.reviewTitle')} description={t('pages.reviewSubtitle')} icon={<AlertTriangle className="size-5" />}>
      {open.length === 0 ? <EmailBillingEmptyState title={t('empty.noReviewsTitle')} description={t('empty.noReviewsDescription')} /> : (
        <div className="grid gap-4">
          {severityGroups.map((group) => (
            <EmailBillingPanel key={group.severity} title={group.severity} icon="alert">
              <div className="space-y-3">
                {group.items.map((item) => (
                  <article key={item.id} className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="flex flex-wrap gap-2"><EmailBillingStatusBadge value={item.severity} /><EmailBillingStatusBadge value={item.status} /><h2 className="font-medium">{item.title}</h2></div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.domain?.domain ?? t('labels.notAvailable')} · {item.domain?.client?.name ?? t('labels.noClient')} · {item.server?.name ?? t('labels.notAvailable')} · {item.createdAt.toLocaleString()}</p>
                    <p className="mt-2 text-sm">{item.description}</p>
                    <p className="mt-2 text-sm font-medium">{t('tables.suggestedAction')}: {item.suggestedAction}</p>
                    <div className="mt-3"><ReviewItemActions item={{ id: item.id, domainId: item.domainId, subscriptionId: item.subscriptionId }} /></div>
                  </article>
                ))}
              </div>
            </EmailBillingPanel>
          ))}
        </div>
      )}
    </DashboardPageShell>
  );
}
