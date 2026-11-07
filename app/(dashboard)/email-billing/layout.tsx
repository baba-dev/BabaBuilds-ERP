import type { ReactNode } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getModuleAvailability } from '@/lib/modules';
import { ModuleUnavailable } from '@/components/modules/ModuleUnavailable';

export default async function EmailBillingLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.workspaceId) redirect('/login');

  // Without this, pages throw ModuleDisabledError and users land on a generic "Failed to load".
  const availability = await getModuleAvailability(session.workspaceId, 'MIAB_BILLING');
  if (availability !== 'enabled') {
    return <ModuleUnavailable moduleKey="MIAB_BILLING" reason={availability} />;
  }

  return children;
}
