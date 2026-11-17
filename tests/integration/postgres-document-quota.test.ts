import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@/lib/prisma-client";

// Disposable local CI database only, same gate as the other PostgreSQL integration tests.
let valid = false;
try {
  const parsed = new URL(process.env.DATABASE_URL ?? "");
  valid = process.env.CI_POSTGRES_FINANCE_TESTS === "1" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) &&
    decodeURIComponent(parsed.pathname.slice(1)) === "bababuilds_erp_ci";
} catch { /* missing database config => disabled */ }

describe.runIf(valid)("document upload quota transaction (PostgreSQL)", () => {
  it("does not exhaust the connection pool and never oversubscribes quota under concurrent uploads", async () => {
    const { getWorkspaceQuotaSnapshot, lockWorkspaceDocumentStorage, consumeWorkspaceDocumentBytes } =
      await import("@/lib/documents/quota");
    const prisma = createPrismaClient(); // default pool; the old code deadlocked at 5 concurrent uploads
    const workspace = await prisma.workspace.create({ data: { name: "quota-" + randomUUID() } });
    try {
      const cap = (await getWorkspaceQuotaSnapshot(workspace.id, prisma)).bytesCapTotal;
      expect(Number.isFinite(cap)).toBe(true);
      const size = 1_000;
      const slots = 4; // exactly four more uploads fit
      await prisma.workspaceDocumentStorage.create({
        data: { workspaceId: workspace.id, bytesUsedTotal: BigInt(cap - slots * size), bytesUsedActive: 0n },
      });

      // Same shape as app/api/documents/upload/route.ts, 16 racing requests.
      const upload = () => prisma.$transaction(async (tx) => {
        await lockWorkspaceDocumentStorage(tx, workspace.id);
        const snapshot = await getWorkspaceQuotaSnapshot(workspace.id, tx);
        if (snapshot.bytesUsedTotal + size > snapshot.bytesCapTotal) return false;
        await consumeWorkspaceDocumentBytes(tx, { workspaceId: workspace.id, addBytes: size });
        return true;
      }, { timeout: 15_000 });

      const results = await Promise.all(Array.from({ length: 16 }, upload));
      expect(results.filter(Boolean)).toHaveLength(slots);
      const row = await prisma.workspaceDocumentStorage.findUniqueOrThrow({ where: { workspaceId: workspace.id } });
      expect(Number(row.bytesUsedTotal)).toBe(cap);
    } finally {
      await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });
});
