import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth/login-redirect";
import { prisma } from "@/lib/prisma";
import { checkPermissionSilent } from "@/lib/rbac";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { UnifiedDocumentList } from "@/components/documents/UnifiedDocumentList";

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
    <div className="space-y-8 max-w-7xl mx-auto w-full pb-12">
      {/* Header section with massive upload dropzone */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 shadow-2xl dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 border border-zinc-800">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="relative z-10 p-8 sm:p-12 space-y-6 text-center">
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white drop-shadow-md">
              Document Center
            </h1>
            <p className="text-sm sm:text-base text-zinc-300 max-w-2xl mx-auto leading-relaxed">
              Upload, analyze, and manage your documents in one unified view. Check "Analyze with AI Agent" to automatically extract summaries and metadata.
            </p>
          </div>
          
          <div className="max-w-4xl mx-auto mt-8">
            <UploadDropzone className="shadow-2xl shadow-black/20" />
          </div>
        </div>
      </div>

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
  );
}
