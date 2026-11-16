import { CompaniesShell } from "@/components/companies/CompaniesShell";
import { SettingsView } from "@/components/companies/GroupViews";

export default function Page() {
  return (
    <CompaniesShell>
      <SettingsView />
    </CompaniesShell>
  );
}
