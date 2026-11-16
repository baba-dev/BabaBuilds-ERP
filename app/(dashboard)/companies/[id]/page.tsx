import { CompaniesShell } from "@/components/companies/CompaniesShell";
import { CompanyForm } from "@/components/companies/CompanyForm";

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <CompaniesShell>
      <CompanyForm workspaceId={id} />
    </CompaniesShell>
  );
}
