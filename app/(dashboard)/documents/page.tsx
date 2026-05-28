import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth/login-redirect";
import { prisma } from "@/lib/prisma";
import { checkPermissionSilent } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StorageMeter } from "@/components/documents/StorageMeter";

async function getWorkspaceId(userId: string) {
  const wu = await prisma.workspaceUser.findFirst({
    where: { userId, isActive: true },
    select: { workspaceId: true },
  });
  return wu?.workspaceId ?? null;
}

export default async function DocumentsOverviewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin("/documents");

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) redirect("/dashboard");

  const canView = await checkPermissionSilent(session.user.id, workspaceId, "documents.view");
  if (!canView) redirect("/dashboard");

  const [quota, inboxCount, unlinkedCount] = await Promise.all([
    prisma.workspaceDocumentStorage.findUnique({
      where: { workspaceId },
      select: { bytesUsedTotal: true, bytesUsedActive: true },
    }),
    prisma.document.count({ where: { workspaceId, isArchived: false, status: "INBOX" } }),
    prisma.document.count({ where: { workspaceId, isArchived: false, links: { none: {} } } }),
  ]);

  const usedTotal = Number(quota?.bytesUsedTotal ?? 0);
  const usedActive = Number(quota?.bytesUsedActive ?? usedTotal);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Document Vault
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Intake, OCR review, linking, and compliance evidence — finance-grade and compact.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/documents/inbox">Open Inbox</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/documents/vault">Open Vault</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card className="border-zinc-200/70 dark:border-zinc-800/70">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-semibold">Inbox</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{inboxCount}</div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Documents awaiting triage and OCR review.</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/70 dark:border-zinc-800/70">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-semibold">Unlinked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{unlinkedCount}</div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Documents not attached to ERP records (expenses, invoices, transactions).
            </p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/70 dark:border-zinc-800/70">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-semibold">Storage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StorageMeter usedBytes={usedTotal} capBytes={null} />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Archive is organizational; archived bytes still count toward plan storage.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

