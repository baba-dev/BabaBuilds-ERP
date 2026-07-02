import { getTranslations } from 'next-intl/server';
import { Settings } from 'lucide-react';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/prisma';
import { SettingsForm } from '@/components/email-billing/client-actions';
import { requireEmailBillingPage } from '../_data';

export default async function SettingsPage() {
  const t = await getTranslations('EmailBilling');
  const workspaceId = await requireEmailBillingPage();
  const [settings, plans] = await Promise.all([
    prisma.mailBillingSettings.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} }),
    prisma.mailBillingPlan.findMany({ where: { workspaceId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return (
    <DashboardPageShell title={t('pages.settingsTitle')} description={t('pages.settingsSubtitle')} icon={<Settings className="size-5" />}>
      <Card variant="panel">
        <CardHeader><CardTitle>{t('sections.moduleSettings')}</CardTitle></CardHeader>
        <CardContent><SettingsForm settings={settings} plans={plans} /></CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">{t('labels.securityBoundary')}</p>
    </DashboardPageShell>
  );
}
