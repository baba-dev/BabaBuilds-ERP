import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { checkPermission } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';
import { StorageMeter } from '@/components/documents/StorageMeter';
import { getWorkspaceQuotaSnapshot } from '@/lib/documents/quota';

export default async function DocumentsCompliancePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin');

  const wu = await prisma.workspaceUser.findFirst({
    where: { userId: session.user.id, isActive: true },
    select: { workspaceId: true },
  });
  const workspaceId = wu?.workspaceId ?? null;
  if (!workspaceId) redirect('/dashboard');

  const [canView, quota] = await Promise.all([
    checkPermission(session.user.id, workspaceId, 'documents.compliance.view'),
    getWorkspaceQuotaSnapshot(workspaceId),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-zinc-500" />
            <h1 className="text-lg font-semibold tracking-tight">Compliance</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Evidence-ready document requirements and links. Compact, auditable, workspace-scoped.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/documents/vault?scope=COMPLIANCE">Open Compliance docs</Link>
          </Button>
        </div>
      </div>

      <StorageMeter usedBytes={quota.bytesUsedTotal} capBytes={quota.bytesCapTotal} />

      {!canView ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">Access required</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You don’t have permission to view Compliance document requirements.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">Coming in v2</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This surface will map compliance requirements to evidence documents, reminders, and export packs for audits.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

