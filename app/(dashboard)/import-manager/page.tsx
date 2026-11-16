import { getTranslations } from 'next-intl/server';
import { Upload } from 'lucide-react';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { ImportManagerClient } from '@/components/import-manager/import-manager-client';

export default async function ImportManagerPage() {
  const t = await getTranslations('ImportManagerHub');
  return (
    <DashboardPageShell title={t('title')} description={t('description')} icon={<Upload className="h-5 w-5 text-amber-500" />} animated={false} maxWidthClassName="max-w-5xl">
      <ImportManagerClient />
    </DashboardPageShell>
  );
}
