'use client';

import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function EmailBillingError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('EmailBilling');
  return (
    <main className="p-6">
      <Card variant="panel">
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertCircle aria-hidden className="size-5" />{t('cards.loadFailedTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{t('cards.loadFailedBody')}</p>
          <Button onClick={reset}>{t('cards.loadFailedRetry')}</Button>
        </CardContent>
      </Card>
    </main>
  );
}
