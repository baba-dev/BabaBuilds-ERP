import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth/login-redirect";
import { prisma } from "@/lib/prisma";
import { checkPermissionSilent } from "@/lib/rbac";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { UnifiedDocumentList } from "@/components/documents/UnifiedDocumentList";
import { FileText, UploadCloud } from "lucide-react";

async function getWorkspaceId(userId: string) {
  const wu = await prisma.workspaceUser.findFirst({
    where: { userId, isActive: true },
    select: { workspaceId: true },
  });
  return wu?.workspaceId ?? null;
}

export default async function DocumentCenterPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin("/documents");

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) redirect("/dashboard");

  const canView = await checkPermissionSilent(session.user.id, workspaceId, "documents.view");
  if (!canView) redirect("/dashboard");

  // Fetch all documents that are not archived
  const documents = await prisma.document.findMany({
    where: { workspaceId, isArchived: false },
    orderBy: { createdAt: "desc" },
    include: {
      files: {
        where: { isCurrent: true },
        select: { mimeType: true, byteSize: true, storedPath: true },
        take: 1,
      },
      links: true,
    },
  });

  return (
    <div className="min-h-app bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8 pb-20 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
        <div className="sticky top-0 z-20 -mx-4 px-4 py-3 md:-mx-8 md:px-8 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 max-w-7xl mx-auto w-full">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
                <div className="p-2.5 bg-accent-primary/10 dark:bg-accent-primary/20 rounded-xl border border-accent-primary/20 dark:border-accent-primary/25">
                  <FileText className="w-6 h-6 text-accent-primary" />
                </div>
              Document Center
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm max-w-xl">
                Upload, analyze, and manage your workspace documents in one unified view.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 rounded-xl border border-accent-primary/20 bg-accent-primary/10 px-4 py-3 text-accent-primary shadow-sm">
              <UploadCloud className="h-4 w-4" />
              <span className="text-xs font-extrabold uppercase tracking-widest">AI-ready vault</span>
            </div>
          </div>
        </div>

        <UploadDropzone />

      {/* Unified Document List Section */}
        <div className="px-2">
        <div className="mb-6">
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Your Documents</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">All uploaded and generated documents across your workspace.</p>
        </div>
        
        {/* Client component for rendering the documents and grid/list toggles */}
        <UnifiedDocumentList documents={documents} />
        </div>
      </div>
    </div>
  );
}
