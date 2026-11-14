import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ShoppingBag, Settings, Sparkles, ArrowRight, ShieldAlert } from "lucide-react";
import { isModuleEnabled } from "@/lib/modules";
import { checkPermission } from "@/lib/rbac";
import { ShopDashboardClient } from "./ShopDashboardClient";

export const dynamic = "force-dynamic";

function ModuleDisabledNotice() {
  return (
    <div className="min-h-app bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-500">Public Shop</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
            <ShoppingBag className="w-8 h-8 text-indigo-500" />
            The Shop module is currently disabled
          </h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300 max-w-2xl">
            Your storefront, public order intake, and shop AI tools are paused. Existing data is
            preserved — re-enabling the module restores everything as it was.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-950/30">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">What stays safe</p>
              <ul className="text-sm text-zinc-600 dark:text-zinc-300 list-disc pl-4 space-y-1">
                <li>All historical orders and invoices</li>
                <li>Product catalog and shop content</li>
                <li>Branding (slug, accent colour, tagline)</li>
              </ul>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-950/30">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">What turns off</p>
              <ul className="text-sm text-zinc-600 dark:text-zinc-300 list-disc pl-4 space-y-1">
                <li>Public <code>/shop/&lt;slug&gt;</code> page returns 404</li>
                <li>New orders + checkout APIs</li>
                <li>Shop AI tools in the chatbot</li>
              </ul>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/settings#optional-modules"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-indigo-700 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Enable in Settings
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Back to dashboard
            </Link>
          </div>
          <p className="mt-6 text-[11px] text-zinc-400 inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Tip: workspace admins can flip this on from Settings → Optional Modules.
          </p>
        </div>
      </div>
    </div>
  );
}

function PermissionDeniedNotice() {
  return (
    <div className="min-h-app bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-500 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" /> Access denied
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
          You don’t have permission to view the Shop dashboard
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          Ask a workspace owner or admin to grant you the <code>shop.view</code> permission.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export default async function ShopDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session?.workspaceId) redirect("/login");

  const moduleEnabled = await isModuleEnabled(session.workspaceId, "SHOP");
  if (!moduleEnabled) return <ModuleDisabledNotice />;

  const userId = session.user.id;
  const workspaceId = session.workspaceId;

  const [canView, canViewOrders, canManageOrders, canManageContent, canManageSettings] =
    await Promise.all([
      checkPermission(userId, workspaceId, "shop.view"),
      checkPermission(userId, workspaceId, "shop.orders.view"),
      checkPermission(userId, workspaceId, "shop.orders.manage"),
      checkPermission(userId, workspaceId, "shop.content.manage"),
      checkPermission(userId, workspaceId, "shop.settings.manage"),
    ]);

  if (!canView) return <PermissionDeniedNotice />;

  return (
    <ShopDashboardClient
      abilities={{
        canViewOrders,
        canManageOrders,
        canManageContent,
        canManageSettings,
      }}
    />
  );
}
