import { CompaniesShell } from "@/components/companies/CompaniesShell";
import { OverviewView } from "@/components/companies/OverviewView";

export default function Page() {
  return (
    <CompaniesShell>
      <OverviewView />
    </CompaniesShell>
  );
}
