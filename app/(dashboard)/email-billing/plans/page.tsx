import { getTranslations } from 'next-intl/server';
import { Tags } from 'lucide-react';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { prisma } from '@/lib/prisma';
import { EmailBillingEmptyState, EmailBillingStatusBadge, EmailBillingTable, TruncatedText } from '@/components/email-billing/ui';
import { PlanDialog, PlanRowActions } from '@/components/email-billing/client-actions';
import { requireEmailBillingPage } from '../_data';

export default async function PlansPage() {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const plans = await prisma.mailBillingPlan.findMany({ where: { workspaceId }, include: { _count: { select: { subscriptions: true } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  const headers = ['name', 'description', 'billingMode', 'currency', 'basePrice', 'includedMailboxes', 'extraMailboxPrice', 'frequency', 'status', 'subscriptions', 'actions'].map((k) => t(`tables.${k}`));
  return (
    <DashboardPageShell title={t('pages.plansTitle')} description={t('pages.plansSubtitle')} icon={<Tags className="size-5" />} primaryAction={<PlanDialog triggerLabel={t('actions.createPlan')} />}>
      {plans.length === 0 ? <EmailBillingEmptyState title={t('empty.noPlansTitle')} description={t('empty.noPlansDescription')} /> : (
        <EmailBillingTable headers={headers} caption={t('pages.plansTitle')}>
          {plans.map((plan) => (
            <tr key={plan.id} className="border-b hover:bg-muted/50">
              <td className="p-2 font-medium"><TruncatedText>{plan.name}</TruncatedText></td>
              <td className="p-2 text-muted-foreground"><TruncatedText>{plan.description ?? t('labels.notAvailable')}</TruncatedText></td>
              <td className="p-2"><EmailBillingStatusBadge value={plan.billingMode} /></td>
              <td className="p-2">{plan.currency}</td>
              <td className="p-2">{plan.basePrice.toString()}</td>
              <td className="p-2">{plan.includedMailboxes}</td>
              <td className="p-2">{plan.extraMailboxPrice.toString()}</td>
              <td className="p-2">{plan.frequency}</td>
              <td className="p-2"><EmailBillingStatusBadge value={plan.isActive ? 'ACTIVE' : 'DISABLED'} /></td>
              <td className="p-2">{plan._count.subscriptions}</td>
              <td className="p-2"><PlanRowActions plan={{ id: plan.id, name: plan.name, description: plan.description, billingMode: plan.billingMode, currency: plan.currency, basePrice: plan.basePrice.toString(), includedMailboxes: plan.includedMailboxes, extraMailboxPrice: plan.extraMailboxPrice.toString(), frequency: plan.frequency, isActive: plan.isActive, sortOrder: plan.sortOrder }} /></td>
            </tr>
          ))}
        </EmailBillingTable>
      )}
    </DashboardPageShell>
  );
}
