import { CompaniesShell } from "@/components/companies/CompaniesShell";
import { TeamView } from "@/components/companies/TeamView";

export default function Page() {
  return (
    <CompaniesShell>
      <TeamView />
    </CompaniesShell>
  );
}
