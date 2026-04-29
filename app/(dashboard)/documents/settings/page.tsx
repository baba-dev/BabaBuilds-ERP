import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { checkPermissionSilent } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StorageMeter } from "@/components/documents/StorageMeter";
import { getWorkspaceQuotaSnapshot } from "@/lib/documents/quota";

export default async function DocumentSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const wu = await prisma.workspaceUser.findFirst({
    where: { userId: session.user.id, isActive: true },
    select: { workspaceId: true },
  });
  const workspaceId = wu?.workspaceId ?? null;
  if (!workspaceId) redirect("/dashboard");

  const [enabled, canView, canManage] = await Promise.all([
    isModuleEnabled(workspaceId, "DOCUMENTS"),
    checkPermissionSilent(session.user.id, workspaceId, "documents.view"),
    checkPermissionSilent(session.user.id, workspaceId, "documents.settings.manage"),
  ]);

  if (!enabled || !canView) redirect("/dashboard?moduleDisabled=DOCUMENTS");

  const quota = await getWorkspaceQuotaSnapshot(workspaceId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Documents · Settings</h1>
        <p className="text-sm text-muted-foreground">
          Storage policy, file type rules, and administrative controls.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Module status</CardTitle>
            <CardDescription>Non-destructive enable/disable via Workspace Modules.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Enabled for this workspace. Toggle in main Settings → Optional Modules.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admin access</CardTitle>
            <CardDescription>Role-aware management actions.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {canManage
              ? "You have permission to manage document settings."
              : "You can view settings but cannot manage them."}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Storage</CardTitle>
          <CardDescription>
            Finance-grade storage policy: quotas, warning thresholds, and auditability.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StorageMeter usedBytes={quota.bytesUsedTotal} capBytes={quota.bytesCapTotal} />
          <div className="text-sm text-muted-foreground">
            Warning thresholds: 70% (warning), 90% (strong warning), 100% (hard stop). Archived documents still count
            toward total storage.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

