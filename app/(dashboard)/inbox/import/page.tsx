import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { getTranslations } from 'next-intl/server';
import { Inbox } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { SharedImportClient } from '@/components/inbox/SharedImportClient';
import { Button } from '@/components/ui/button';
import { isValidShareId, loadSharedPayload, toSafeHttpUrl } from '@/lib/uploads/share-target';

export default async function SharedImportPage({ searchParams }: { searchParams: Promise<{ shareId?: string }> }) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  if (!workspaceId) redirect('/login?callbackUrl=/inbox/import');

  const t = await getTranslations('InboxImport');
  const { shareId } = await searchParams;
  const payload = isValidShareId(shareId) ? await loadSharedPayload(workspaceId, shareId) : null;

  return (
    <DashboardPageShell title={t('title')} description={t('description')} icon={<Inbox className="h-5 w-5 text-indigo-500" />} animated={false} maxWidthClassName="max-w-5xl">
      {!payload || !isValidShareId(shareId) ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center">
          <p className="text-base font-black">{t('emptyTitle')}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('emptyBody')}</p>
          <Button asChild className="mt-4"><Link href="/documents">{t('back')}</Link></Button>
        </div>
      ) : (
        <SharedImportClient
          shareId={shareId}
          title={payload.title}
          text={payload.text}
          sourceUrl={toSafeHttpUrl(payload.url)}
          receivedAt={payload.createdAt}
          files={payload.files.map((f, i) => ({ originalName: f.originalName, mimeType: f.mimeType, size: f.size, publicUrl: f.publicUrl, importedDocumentId: payload.imported?.[String(i)] }))}
        />
      )}
    </DashboardPageShell>
  );
}
