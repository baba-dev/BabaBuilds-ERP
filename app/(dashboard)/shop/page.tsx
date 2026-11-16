import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { ShieldAlert, ShoppingBag } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/modules";
import { checkPermissionsSilent } from "@/lib/rbac";
import { ShopWorkspace } from "./_components/ShopWorkspace";

export const dynamic = "force-dynamic";

export default async function ShopDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session?.workspaceId) redirect("/login");
  const t = await getTranslations("ShopHub");
  const workspaceId = session.workspaceId;

  if (!(await isModuleEnabled(workspaceId, "SHOP"))) {
    return (
      <div className="min-h-app p-4 md:p-8">
        <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 shadow-sm">
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight"><ShoppingBag className="h-7 w-7 text-indigo-500" />{t("notice.disabledTitle")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("notice.disabledBody")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/settings#optional-modules" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{t("notice.enable")}</Link>
            <Link href="/dashboard" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">{t("notice.back")}</Link>
          </div>
        </div>
      </div>
    );
  }

  const g = await checkPermissionsSilent(session.user.id, workspaceId, ["shop.view", "shop.orders.view", "shop.orders.manage", "shop.content.manage", "shop.settings.manage"]);
  if (!g["shop.view"]) {
    return (
      <div className="min-h-app p-4 md:p-8">
        <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-rose-500"><ShieldAlert className="h-4 w-4" />{t("notice.deniedTag")}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("notice.deniedTitle")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("notice.deniedBody")}</p>
          <Link href="/dashboard" className="mt-5 inline-flex rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">{t("notice.back")}</Link>
        </div>
      </div>
    );
  }

  return <ShopWorkspace abilities={{ canViewOrders: g["shop.orders.view"], canManageOrders: g["shop.orders.manage"], canManageContent: g["shop.content.manage"], canManageSettings: g["shop.settings.manage"] }} />;
}
