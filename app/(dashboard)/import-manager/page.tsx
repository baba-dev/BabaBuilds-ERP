import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { ImportManagerClient } from '@/components/import-manager/import-manager-client';

export default function ImportManagerPage() {
  return (
    <DashboardPageShell
      title="Import Manager"
      description="Preview-first, validation-heavy imports for clients, services, shop items, inventory, proposals, and expenses."
      maxWidthClassName="max-w-7xl"
    >
      <ImportManagerClient />
    </DashboardPageShell>
  );
}
