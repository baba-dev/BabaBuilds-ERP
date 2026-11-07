import { ReactNode } from "react";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getModuleAvailability } from "@/lib/modules";
import { ModuleUnavailable } from "@/components/modules/ModuleUnavailable";

function getWorkspaceId(session: unknown): string | null {
  const workspaceId = (session as { workspaceId?: unknown })?.workspaceId;
  return typeof workspaceId === "string" && workspaceId.length > 0 ? workspaceId : null;
}

export default async function CompaniesLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  const workspaceId = getWorkspaceId(session);

  if (!workspaceId) redirect("/dashboard");

  const availability = await getModuleAvailability(workspaceId, "MULTI_COMPANY");
  if (availability !== "enabled") {
    return <ModuleUnavailable moduleKey="MULTI_COMPANY" reason={availability} />;
  }

  return children;
}
