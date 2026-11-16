import { CompaniesShell } from "@/components/companies/CompaniesShell";
import { BillingView } from "@/components/companies/GroupViews";

export default function Page() {
  return (
    <CompaniesShell>
      <BillingView />
    </CompaniesShell>
  );
}
