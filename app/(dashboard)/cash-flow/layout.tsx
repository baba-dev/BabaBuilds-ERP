import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth/login-redirect";
import { prisma } from "@/lib/prisma";
import { getModuleAvailability } from "@/lib/modules";
import type { ReactNode } from "react";
import { ModuleUnavailable } from "@/components/modules/ModuleUnavailable";

export const metadata: Metadata = {
  title: "Cash Flow · BabaBuilds ERP",
  robots: { index: false, follow: false },
};

async function getWorkspaceId(userId: string) {
  const wu = await prisma.workspaceUser.findFirst({
    where: { userId, isActive: true },
    select: { workspaceId: true },
  });
  return wu?.workspaceId ?? null;
}

export default async function CashFlowLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin("/cash-flow");

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) redirect("/dashboard");

  const availability = await getModuleAvailability(workspaceId, "CASH_FLOW");
  if (availability !== "enabled") {
    return <ModuleUnavailable moduleKey="CASH_FLOW" reason={availability} />;
  }

  return children;
}
