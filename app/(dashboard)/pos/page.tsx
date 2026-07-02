import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import PosSystem from "@/components/pos/PosSystem";
import { redirect } from "next/navigation";
import { checkPermissionsSilent, requirePermission } from "@/lib/rbac";

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

  const posCapabilities = await checkPermissionsSilent(session.user.id, workspaceId, [
    "pos.custom_item",
    "pos.discount",
  ]);

  const clients = await prisma.client.findMany({
    where: { workspaceId },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' }
  });

  return (
    <div className="w-full h-full">
      <PosSystem
        clients={clients}
        canCreateCustomItems={posCapabilities["pos.custom_item"]}
        canApplyDiscounts={posCapabilities["pos.discount"]}
      />
    </div>
  );
}
