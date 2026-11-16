import { CompaniesShell } from "@/components/companies/CompaniesShell";
import { DashboardView } from "@/components/companies/GroupViews";

export default function Page() {
  return (
    <CompaniesShell>
      <DashboardView />
    </CompaniesShell>
  );
}
