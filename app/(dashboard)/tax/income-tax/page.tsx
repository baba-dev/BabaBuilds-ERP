import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/modules";
import { getActiveWorkspaceIdForUser } from "@/lib/workspace-scope";
import TaxDashboardClient from "../TaxDashboardClient";

// The previous /tax page, kept as the income-tax estimator, savings ledger and advanced tools.
export const metadata = { title: "Income tax & savings" };

export default async function IncomeTaxPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const workspaceId = session?.workspaceId ?? (await getActiveWorkspaceIdForUser(userId));
  const taxAdvancedEnabled = workspaceId ? await isModuleEnabled(workspaceId, "TAX_ADVANCED") : false;
  return <TaxDashboardClient taxAdvancedEnabled={taxAdvancedEnabled} />;
}
