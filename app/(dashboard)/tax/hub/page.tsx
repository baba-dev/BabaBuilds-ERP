import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth/login-redirect";
import { TaxHubOverview } from "@/components/tax/tax-hub-overview";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { getActiveWorkspaceIdForUser } from "@/lib/workspace-scope";
import { isModuleEnabled } from "@/lib/modules";
import { ArrowRight, FileBarChart2 } from "lucide-react";

export default async function TaxHubPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirectToLogin("/tax/hub");
  }

  const workspaceId = await getActiveWorkspaceIdForUser(userId);
  const taxAdvancedEnabled = workspaceId
    ? await isModuleEnabled(workspaceId, "TAX_ADVANCED")
    : false;

  if (!taxAdvancedEnabled) {
    redirect("/tax");
  }

  return (
    <DashboardPageShell
      title="Tax hub"
      description="Obligations, readiness checks, return periods, and compliance activity in one place."
      icon={<FileBarChart2 className="h-5 w-5" />}
      primaryAction={
        <Button asChild variant="outline" size="sm">
          <Link href="/tax">
            Full tax dashboard
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      }
      animated={false}
    >
      <TaxHubOverview />
    </DashboardPageShell>
  );
}
