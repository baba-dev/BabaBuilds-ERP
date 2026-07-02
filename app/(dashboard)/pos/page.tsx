import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import PosSystem from "@/components/pos/PosSystem";
import { redirect } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { checkPermissionsSilent, requirePermission } from "@/lib/rbac";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Point of Sale | BabaERP",
};

export default async function PosPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.workspaceId) {
    redirect("/login");
  }

  const workspaceId = session.workspaceId;

  try {
    await requirePermission(session.user.id, workspaceId, "pos.view");
  } catch {
    redirect("/dashboard");
  }

  const t = await getTranslations("POS");

  const posCapabilities = await checkPermissionsSilent(
    session.user.id,
    workspaceId,
    ["pos.custom_item", "pos.discount"],
  );

  const clients = await prisma.client.findMany({
    where: { workspaceId },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8 pb-20 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
        <div className="sticky top-0 z-20 -mx-4 px-4 py-3 md:-mx-8 md:px-8 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 max-w-7xl mx-auto w-full">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
                <div className="p-2.5 bg-accent-primary/10 dark:bg-accent-primary/20 rounded-xl border border-accent-primary/20 dark:border-accent-primary/25">
                  <ShoppingCart className="w-6 h-6 text-accent-primary" />
                </div>
                {t("page_title")}
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm max-w-xl">
                {t("page_subtitle")}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 rounded-xl border border-accent-primary/20 bg-accent-primary/10 px-4 py-3 text-accent-primary shadow-sm">
              <span className="text-xs font-extrabold uppercase tracking-widest">
                {t("checkout_workspace")}
              </span>
            </div>
          </div>
        </div>
        <PosSystem
          clients={clients}
          canCreateCustomItems={posCapabilities["pos.custom_item"]}
          canApplyDiscounts={posCapabilities["pos.discount"]}
          currencyCode={
            session.user.currencyFormat || session.baseCurrency || "INR"
          }
          locale={session.locale || "en-IN"}
        />
      </div>
    </div>
  );
}
