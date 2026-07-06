import { ReactNode } from "react";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/modules";

function getWorkspaceId(session: unknown): string | null {
  const workspaceId = (session as { workspaceId?: unknown })?.workspaceId;
  return typeof workspaceId === "string" && workspaceId.length > 0 ? workspaceId : null;
}

export default async function CompaniesLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  const workspaceId = getWorkspaceId(session);

  if (!workspaceId || !(await isModuleEnabled(workspaceId, "MULTI_COMPANY"))) {
    redirect("/dashboard");
  }

  return children;
}
