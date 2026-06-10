import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import PosSystem from "@/components/pos/PosSystem";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Point of Sale | BabaERP",
};

export default async function PosPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.workspaceId) {
    redirect("/login");
  }

  const workspaceId = session.workspaceId;

  const clients = await prisma.client.findMany({
    where: { workspaceId },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' }
  });

  return (
    <div className="w-full h-full">
      <PosSystem clients={clients} />
    </div>
  );
}
