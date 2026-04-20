import { prisma } from "@/lib/prisma";

export async function logDistributorAudit(input: {
  distributorId?: string | null;
  actorEmail?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.distributorAuditLog.create({
      data: {
        distributorId: input.distributorId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        metadata: input.metadata as object | undefined,
      },
    });
  } catch (e) {
    console.error("[distributor-audit]", e);
  }
}
