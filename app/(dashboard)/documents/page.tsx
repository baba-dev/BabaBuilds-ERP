import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth/login-redirect";
import { checkPermissionsSilent } from "@/lib/rbac";
import { resolveSessionMembership } from "@/lib/workspace-scope";
import { DocumentLibrary } from "@/components/documents/DocumentLibrary";
import { DocumentsShell } from "@/components/documents/DocumentsShell";

export default async function DocumentCenterPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin("/documents");

  const workspaceId = (await resolveSessionMembership(session))?.workspaceId ?? null;
  if (!workspaceId) redirect("/dashboard");

  const grants = await checkPermissionsSilent(session.user.id, workspaceId, ["documents.view", "documents.manage", "documents.archive"]);
  if (!grants["documents.view"]) redirect("/dashboard");

  return (
    <DocumentsShell>
      <DocumentLibrary canManage={!!grants["documents.manage"]} canArchive={!!grants["documents.archive"]} />
    </DocumentsShell>
  );
}
