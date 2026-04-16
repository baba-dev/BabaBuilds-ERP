import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { checkPermission } from "@/lib/rbac";
import { WorkforceSubNav } from "@/components/workforce/WorkforceLayout";
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
  if (!session?.user?.id) redirect("/auth/signin");

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) redirect("/dashboard");

  // Guard: redirect to dashboard if module disabled
  const [moduleEnabled, canView] = await Promise.all([
    isModuleEnabled(workspaceId, "WORKFORCE"),
    checkPermission(session.user.id, workspaceId, "workforce.view"),
  ]);

  if (!moduleEnabled || !canView) {
    redirect("/dashboard?moduleDisabled=WORKFORCE");
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-zinc-950">
      {/* Module header */}
      <div className="border-b border-white/5 bg-zinc-950">
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/20">
              <svg className="h-4 w-4 text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-zinc-100 leading-tight">Workforce</h1>
              <p className="text-[11px] text-zinc-500">People, Attendance &amp; Leave Management</p>
            </div>
          </div>
          <WorkforceSubNav />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
