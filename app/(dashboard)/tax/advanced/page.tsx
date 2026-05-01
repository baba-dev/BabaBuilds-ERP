import { TaxComplianceOps } from '@/components/tax/tax-compliance-ops';
import { TaxHubOverview } from '@/components/tax/tax-hub-overview';
import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function TaxAdvancedPage() {
  return (
    <DashboardPageShell title="Tax advanced" description="Advanced tax compliance and controls." animated={false}>
      <Tabs defaultValue="overview" className="w-full space-y-6">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-zinc-100/80 p-1 dark:bg-zinc-900/80">
          <TabsTrigger value="overview" className="text-xs font-semibold">Overview</TabsTrigger>
          <TabsTrigger value="compliance" className="text-xs font-semibold">Compliance & imports</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-0 outline-none">
          <TaxHubOverview />
        </TabsContent>
        <TabsContent value="compliance" className="mt-0 outline-none">
          <TaxComplianceOps />
        </TabsContent>
      </Tabs>
    </DashboardPageShell>
  );
}
