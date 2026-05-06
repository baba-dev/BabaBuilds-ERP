import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isModuleEnabled } from '@/lib/modules';
import { getActiveWorkspaceIdForUser } from '@/lib/workspace-scope';
import TaxDashboardClient from './TaxDashboardClient';

export default async function TaxDashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect('/login');
  }

  const workspaceId = await getActiveWorkspaceIdForUser(userId);
  const taxAdvancedEnabled = workspaceId
    ? await isModuleEnabled(workspaceId, 'TAX_ADVANCED')
    : false;

  return <TaxDashboardClient taxAdvancedEnabled={taxAdvancedEnabled} />;
}
