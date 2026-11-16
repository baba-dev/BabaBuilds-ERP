import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth/login-redirect";
import { resolveSessionMembership } from "@/lib/workspace-scope";
import { getModuleAvailability } from "@/lib/modules";
import { checkPermissionSilent } from "@/lib/rbac";
import type { ReactNode } from "react";
import { ModuleUnavailable } from "@/components/modules/ModuleUnavailable";


export default async function PayrollLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin("/payroll");

  const workspaceId = (await resolveSessionMembership(session))?.workspaceId ?? null;
  if (!workspaceId) redirect("/dashboard");

  const [availability, canView] = await Promise.all([
    getModuleAvailability(workspaceId, "PAYROLL"),
    checkPermissionSilent(session.user.id, workspaceId, "payroll.view"),
  ]);

  if (!canView) redirect("/dashboard");
  if (availability !== "enabled") {
    return <ModuleUnavailable moduleKey="PAYROLL" reason={availability} />;
  }

  return children;
}
