import { prisma } from "@/lib/prisma";

/** The workspace's uploaded QR images in display order. */
export async function loadPaymentQrImages(workspaceId: string): Promise<Array<{ label: string; imagePath: string; sortOrder: number }>> {
  return prisma.paymentQrImage.findMany({
    where: { workspaceId },
    select: { label: true, imagePath: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
    take: 3,
  });
}
