import type { Metadata } from 'next';
import OpenFilePageClient from './OpenFilePageClient';

export const metadata: Metadata = {
  title: 'Open File Import',
  description: 'Utility screen to import launched files into invoices, expenses, or reconciliation workflows.',
  alternates: {
    canonical: 'https://erp.bababuilds.com/open-file',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function OpenFilePage() {
  return <OpenFilePageClient />;
}
