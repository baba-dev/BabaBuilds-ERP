import type { Metadata } from 'next';
import PublicProposalPageClient from './PublicProposalPageClient';
import { getTokenizedPrivatePageMetadata } from '@/lib/metadata/tokenized-private-page';

export function generateMetadata(): Metadata {
  return getTokenizedPrivatePageMetadata({
    title: 'Proposal Viewer',
    description: 'Review and respond to a shared proposal.',
  });
}

export default function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  return <PublicProposalPageClient params={params} />;
}
