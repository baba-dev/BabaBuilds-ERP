import { CompaniesShell } from "@/components/companies/CompaniesShell";
import { ReportsView } from "@/components/companies/GroupViews";

export default function Page() {
  return (
    <CompaniesShell>
      <ReportsView />
    </CompaniesShell>
  );
}
