import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPermissionSilent } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StorageMeter } from "@/components/documents/StorageMeter";
import { getWorkspaceQuotaSnapshot } from "@/lib/documents/quota";

async function getWorkspaceId(userId: string) {
  const wu = await prisma.workspaceUser.findFirst({
    where: { userId, isActive: true },
    select: { workspaceId: true },
  });
  return wu?.workspaceId ?? null;
}

export default async function DocumentsVaultPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) redirect("/dashboard");

  const canView = await checkPermissionSilent(session.user.id, workspaceId, "documents.view");
  if (!canView) redirect("/dashboard");

  const [quota, docs] = await Promise.all([
    getWorkspaceQuotaSnapshot(workspaceId),
    prisma.document.findMany({
      where: { workspaceId, isArchived: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        category: true,
        scope: true,
        status: true,
        createdAt: true,
        files: {
          where: { isCurrent: true },
          take: 1,
          select: { mimeType: true, byteSize: true, storedPath: true },
        },
        links: { select: { id: true, targetType: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Vault
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Searchable record-linked documents with audit-grade metadata.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/documents/inbox">Open Inbox</Link>
          </Button>
        </div>
      </div>

      <StorageMeter usedBytes={quota.bytesUsedTotal} capBytes={quota.bytesCapTotal} compact />

      <Card className="border-zinc-200/70 dark:border-zinc-800/70">
        <CardHeader className="py-4">
          <CardTitle className="text-sm font-semibold">Documents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Links</TableHead>
                <TableHead className="text-right pr-4">Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-6 text-sm text-muted-foreground">
                    No documents yet. Start in the Upload Center.
                  </TableCell>
                </TableRow>
              ) : (
                docs.map((d: (typeof docs)[number]) => {
                  const current = d.files[0];
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="px-4">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                            {d.title}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {current?.mimeType ?? "—"}
                            {current?.storedPath ? (
                              <>
                                {" · "}
                                <a
                                  className="underline underline-offset-4 hover:text-zinc-800 dark:hover:text-zinc-200"
                                  href={current.storedPath}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  preview
                                </a>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={d.status === "FAILED" ? "destructive" : "secondary"} className="capitalize">
                          {d.status.toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-600 dark:text-zinc-300">
                        {d.category}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-600 dark:text-zinc-300">
                        {d.scope}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-600 dark:text-zinc-300">
                        {d.links.length || "—"}
                      </TableCell>
                      <TableCell className="text-right pr-4 text-xs text-zinc-600 dark:text-zinc-300">
                        {current ? `${Math.ceil(current.byteSize / 1024)} KB` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

