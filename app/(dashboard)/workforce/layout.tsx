import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth/login-redirect";
import { prisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { checkPermissionSilent } from "@/lib/rbac";
import type { ReactNode } from "react";

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

  // Guard: redirect to dashboard if module disabled
  const [moduleEnabled, canView] = await Promise.all([
    isModuleEnabled(workspaceId, "WORKFORCE"),
    checkPermissionSilent(session.user.id, workspaceId, "workforce.view"),
  ]);

  if (!moduleEnabled || !canView) {
    redirect("/dashboard?moduleDisabled=WORKFORCE");
  }

  return children;
}
