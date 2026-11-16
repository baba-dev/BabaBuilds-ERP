import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { ShoppingCart } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { checkPermissionsSilent } from "@/lib/rbac";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import PosRegister from "@/components/pos/PosRegister";

export const metadata = { title: "Point of Sale | BabaERP" };

export default async function PosPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.workspaceId) redirect("/login");
  const workspaceId = session.workspaceId;
  const t = await getTranslations("POS");

  if (!(await isModuleEnabled(workspaceId, "POS"))) {
    return (
      <div className="min-h-app p-4 md:p-8">
        <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 shadow-sm">
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight"><ShoppingCart className="h-7 w-7 text-amber-500" />{t("disabledTitle")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("disabledBody")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/settings#workspace-modules" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{t("enable")}</Link>
            <Link href="/dashboard" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">{t("backToDashboard")}</Link>
          </div>
        </div>
      </div>
    );
  }

  const grants = await checkPermissionsSilent(session.user.id, workspaceId, ["pos.view", "pos.checkout", "pos.custom_item", "pos.discount", "pos.refund"]);
  if (!grants["pos.view"]) redirect("/dashboard");

  const clients = await prisma.client.findMany({ where: { workspaceId, isWalkIn: false, archivedAt: null }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" }, take: 2000 });

  return (
    <DashboardPageShell title={t("title")} description={t("subtitle")} icon={<ShoppingCart className="h-6 w-6 text-primary" />}>
      <PosRegister
        clients={clients}
        canCheckout={grants["pos.checkout"]}
        canRefund={grants["pos.refund"]}
        canCreateCustomItems={grants["pos.custom_item"]}
        canApplyDiscounts={grants["pos.discount"]}
        currencyCode={session.user.currencyFormat || session.baseCurrency || "INR"}
        locale={session.locale || "en-IN"}
      />
    </DashboardPageShell>
  );
}
