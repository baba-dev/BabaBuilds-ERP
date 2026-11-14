import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth/login-redirect";
import { getModuleAvailability } from "@/lib/modules";
import type { ReactNode } from "react";
import { ModuleUnavailable } from "@/components/modules/ModuleUnavailable";

export const metadata: Metadata = { title: "Cash Flow · BabaBuilds ERP", robots: { index: false, follow: false } };

export default async function CashFlowLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin("/cash-flow");
  // The session carries the workspace the person is working in (a person can belong to several).
  const workspaceId = session.workspaceId as string | undefined;
  if (!workspaceId) redirect("/dashboard");
  const availability = await getModuleAvailability(workspaceId, "CASH_FLOW");
  if (availability !== "enabled") return <ModuleUnavailable moduleKey="CASH_FLOW" reason={availability} />;
  return children;
}
