/**
 * D4: real PostgreSQL financial concurrency and latency probe, synthetic rows only.
 * Usage: ERP_STAGING_TESTS=1 DATABASE_URL=<isolated URL> npx tsx scripts/staging/d4-probe.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

function assertStaging() {
  const u = new URL(process.env.DATABASE_URL || "");
  const db = decodeURIComponent(u.pathname.slice(1));
  if (process.env.ERP_STAGING_TESTS !== "1" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
      !["postgres:", "postgresql:"].includes(u.protocol) ||
      !/^bababuilds_erp_(?:staging_[a-z0-9]{4,12}|ci)$/.test(db)) {
    throw new Error("D4 refuses non-isolated or non-local database");
  }
  return db;
}

function percentile(samples: number[], ratio: number) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil((sorted.length - 1) * ratio)]!;
}

async function main() {
  const database = assertStaging();
  const prisma = new PrismaClient();
  const timings: number[] = [];
  let workspace: { id: string } | null = null;
  try {
    workspace = await prisma.workspace.create({ data: {
      name: "D4 synthetic " + randomUUID(), isDemo: true,
    } });
    const wsid = workspace.id;
    const makeInvoice = () => prisma.invoice.create({
      data: {
        workspaceId: wsid, invoiceNumber: "D4-" + randomUUID(),
        financialYear: "2026-27", invoiceDate: new Date(),
        clientName: "D4 Internal Test", serviceDescription: "Synthetic",
        totalAmount: new Prisma.Decimal("100.00"),
        grandTotal: new Prisma.Decimal("100.00"),
        amountReceived: new Prisma.Decimal("0"),
        pdfPath: "/synthetic-only",
      },
    });
    const capture = (invoiceId: string, key: string) => prisma.$transaction(async tx => {
      await tx.financialOperationIdempotency.create({
        data: {
          workspaceId: wsid, operation: "INVOICE_PAYMENT_CAPTURE",
          idempotencyKey: key, requestHash: "d4-fixture",
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      const changed = await tx.invoice.updateMany({
        where: { id: invoiceId, workspaceId: wsid, amountReceived: new Prisma.Decimal(0) },
        data: { amountReceived: new Prisma.Decimal(100), status: "PAID", dateReceived: new Date() },
      });
      if (changed.count !== 1) throw new Error("CAS_LOST");
      await tx.invoicePayment.create({
        data: { workspaceId: wsid, invoiceId, amount: new Prisma.Decimal(100),
                receivedAt: new Date(), idempotencyKey: key },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000, maxWait: 10_000 });

    for (let i = 0; i < 80; i++) {
      const start = performance.now();
      await prisma.$queryRawUnsafe("SELECT 1");
      timings.push(performance.now() - start);
    }
    // Representative read-only workload on the migrated dataset, without
    // returning customer rows or merging unlike-currency financial amounts.
    const workload: number[] = [];
    for (let i = 0; i < 60; i++) {
      const start = performance.now();
      if (i % 3 === 0) {
        await prisma.invoice.aggregate({ _sum: { grandTotal: true }, where: { voidedAt: null } });
      } else if (i % 3 === 1) {
        await prisma.expense.aggregate({ _sum: { amount: true } });
      } else {
        await prisma.workspaceUser.count();
      }
      workload.push(performance.now() - start);
    }
    const invoiceA = await makeInvoice();
    const same = await Promise.allSettled(Array.from({ length: 16 },
      () => capture(invoiceA.id, "same-" + invoiceA.id)));
    const successesA = same.filter(x => x.status === "fulfilled").length;
    if (successesA !== 1) throw new Error("D4 same-key captures: fulfilled=" + successesA);
    if (await prisma.invoicePayment.count({ where: { invoiceId: invoiceA.id } }) !== 1)
      throw new Error("D4 duplicate payment persisted");
    if (!(await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA.id } }))
      .amountReceived?.equals(100)) throw new Error("D4 amountReceived incorrect");

    const invoiceB = await makeInvoice();
    const other = await Promise.allSettled([
      capture(invoiceB.id, "distinct-left-" + invoiceB.id),
      capture(invoiceB.id, "distinct-right-" + invoiceB.id),
    ]);
    if (other.filter(x => x.status === "fulfilled").length !== 1 ||
        await prisma.invoicePayment.count({ where: { invoiceId: invoiceB.id } }) !== 1)
      throw new Error("D4 serializable competing-key assertion failed");

    const stats = await prisma.$queryRawUnsafe<Array<{
      maxConnections: number | bigint; activeConnections: number | bigint;
    }>>("SELECT (SELECT setting::integer FROM pg_settings WHERE name='max_connections') AS \"maxConnections\", COUNT(*) AS \"activeConnections\" FROM pg_stat_activity WHERE datname = current_database()");
    const p95 = percentile(timings, 0.95);
    const workloadP95 = percentile(workload, 0.95);
    if (p95 > 1500 || workloadP95 > 2500)
      throw new Error("D4 PostgreSQL baseline or representative query p95 exceeds threshold");
    console.log(JSON.stringify({
      status: "PASS", database, reads: timings.length,
      read_p95_ms: Math.round(p95), representative_queries: workload.length,
      workload_p95_ms: Math.round(workloadP95), duplicate_key_attempts: 16,
      successful_capture_per_invoice: 1,
      postgres_connections: Number(stats[0]?.activeConnections || 0),
      postgres_max_connections: Number(stats[0]?.maxConnections || 0),
      synthetic_writes_only: true,
    }));
  } finally {
    if (workspace) await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => null);
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("D4 STAGING PROBE FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
