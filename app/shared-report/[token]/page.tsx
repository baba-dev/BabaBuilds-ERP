import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { hashShareToken } from '@/lib/reporting/shares';
import { LINEAGE } from '@/lib/reporting/lineage';
import { getTokenizedPrivatePageMetadata } from '@/lib/metadata/tokenized-private-page';
import type { ReportResult } from '@/lib/reporting/types';
import SharedReportClient from './SharedReportClient';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return getTokenizedPrivatePageMetadata({ title: 'Shared report', description: 'A report shared with you.' });
}

/** A frozen, read-only report opened from a share link. No sign-in; the link is the secret, it expires, and the owner can revoke it. */
export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) notFound();
  const share = await prisma.reportShare.findUnique({ where: { tokenHash: hashShareToken(token) }, select: { id: true, status: true, expiresAt: true, snapshots: { orderBy: { createdAt: 'desc' }, take: 1, select: { generatedPayloadJson: true, createdAt: true } } } });
  if (!share || share.status !== 'ACTIVE') notFound();
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    await prisma.reportShare.update({ where: { id: share.id }, data: { status: 'EXPIRED' } }).catch(() => null);
    notFound();
  }
  const payload = share.snapshots[0]?.generatedPayloadJson as { result?: ReportResult; title?: string; company?: string | null; reportId?: string } | null;
  if (!payload?.result) notFound();
  void prisma.reportShare.update({ where: { id: share.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } }).catch(() => null);
  return <SharedReportClient result={payload.result} title={payload.title ?? ''} company={payload.company ?? null} reportId={payload.reportId ?? ''} lineage={LINEAGE[payload.reportId ?? ''] ?? null} createdAt={share.snapshots[0]!.createdAt.toISOString()} expiresAt={share.expiresAt?.toISOString() ?? null} />;
}
