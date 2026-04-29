import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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

export default async function DocumentsLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) redirect("/dashboard");

  const [moduleEnabled, canView] = await Promise.all([
    isModuleEnabled(workspaceId, "DOCUMENTS"),
    checkPermissionSilent(session.user.id, workspaceId, "documents.view"),
  ]);

  if (!moduleEnabled || !canView) {
    redirect("/dashboard?moduleDisabled=DOCUMENTS");
  }

  return children;
}

