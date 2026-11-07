import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth/login-redirect";
import { prisma } from "@/lib/prisma";
import { getModuleAvailability } from "@/lib/modules";
import { checkPermissionSilent } from "@/lib/rbac";
import type { ReactNode } from "react";
import { ModuleUnavailable } from "@/components/modules/ModuleUnavailable";

async function getWorkspaceId(userId: string) {
  const wu = await prisma.workspaceUser.findFirst({
    where: { userId, isActive: true },
    select: { workspaceId: true },
  });
  return wu?.workspaceId ?? null;
}

export default async function WorkforceLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin("/workforce");

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) redirect("/dashboard");

  const [availability, canView] = await Promise.all([
    getModuleAvailability(workspaceId, "WORKFORCE"),
    checkPermissionSilent(session.user.id, workspaceId, "workforce.view"),
  ]);

  if (!canView) redirect("/dashboard");
  if (availability !== "enabled") {
    return <ModuleUnavailable moduleKey="WORKFORCE" reason={availability} />;
  }

  return children;
}
