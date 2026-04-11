import type { Metadata } from 'next';
import PublicProposalPageClient from './PublicProposalPageClient';

const BASE_URL = 'https://erp.bababuilds.com';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;

  return {
    title: 'Secure Proposal Viewer',
    description: 'Private proposal review and acceptance page accessed via secure tokenized link.',
    alternates: {
      canonical: `${BASE_URL}/p/${token}`,
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  return <PublicProposalPageClient params={params} />;
}
