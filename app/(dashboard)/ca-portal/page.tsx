import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { checkPermissionsSilent } from "@/lib/rbac";
import { getActiveWorkspaceIdForUser } from "@/lib/workspace-scope";
import { CaWorkspace } from "./_components/CaWorkspace";

export const metadata: Metadata = { title: "CA Compliance" };

export default async function CaPortalPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const workspaceId = session?.workspaceId ?? (await getActiveWorkspaceIdForUser(userId));
  const grants = workspaceId ? await checkPermissionsSilent(userId, workspaceId, ["ca.view"] as const) : { "ca.view": false };
  if (!grants["ca.view"]) {
    const t = await getTranslations("CaCompliance.noAccess");
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300"><ShieldAlert className="size-6" aria-hidden /></span>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("body")}</p>
      </div>
    );
  }
  // useSearchParams (URL-backed tab and year) requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <CaWorkspace />
    </Suspense>
  );
}
