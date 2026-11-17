import { describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { recordInvoicePayment } from "@/lib/invoices/payments";

// Never run these writes against production or an existing customer database.
const url = process.env.DATABASE_URL;
let valid = false;
try {
  const parsed = new URL(url ?? "");
  valid = process.env.CI_POSTGRES_FINANCE_TESTS === "1" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) &&
    decodeURIComponent(parsed.pathname.slice(1)) === "bababuilds_erp_ci";
} catch { /* missing database config => disabled */ }

describe.runIf(valid)("PostgreSQL financial concurrency", () => {
  it("prevents duplicate payment and lost-update on concurrent requests", async () => {
    const prisma = new PrismaClient();
    const workspace = await prisma.workspace.create({
      data: { name: "pg-concurrency-" + randomUUID() }
    });
    const makeInvoice = async () => prisma.invoice.create({
      data: {
        workspaceId: workspace.id,
        invoiceNumber: randomUUID(),
        financialYear: "2026-27",
        invoiceDate: new Date(),
        clientName: "Fixture",
        serviceDescription: "Concurrent payment fixture",
        totalAmount: new Prisma.Decimal("100.00"),
        grandTotal: new Prisma.Decimal("100.00"),
        amountReceived: new Prisma.Decimal("0.00"),
        pdfPath: "/nonexistent-test-only.pdf",
      }
    });
    const capture = (invoiceId: string, key: string) => prisma.$transaction(async (tx) => {
      await tx.financialOperationIdempotency.create({
        data: {
          workspaceId: workspace.id, operation: "INVOICE_PAYMENT_CAPTURE",
          idempotencyKey: key, requestHash: "test-hash",
          expiresAt: new Date(Date.now() + 60000)
        }
      });
      const changed = await tx.invoice.updateMany({
        where: { id: invoiceId, workspaceId: workspace.id, amountReceived: new Prisma.Decimal(0) },
        data: { amountReceived: new Prisma.Decimal(100), status: "PAID", dateReceived: new Date() }
      });
      if (changed.count !== 1) throw new Error("CAS_LOST");
      await tx.invoicePayment.create({
        data: {
          workspaceId: workspace.id, invoiceId, amount: new Prisma.Decimal(100),
          receivedAt: new Date(), idempotencyKey: key
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    try {
      const invoiceA = await makeInvoice();
      const sameKey = await Promise.allSettled(
        Array.from({ length: 8 }, () => capture(invoiceA.id, "same-" + invoiceA.id))
      );
      expect(sameKey.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.invoicePayment.count({ where: { invoiceId: invoiceA.id } })).toBe(1);
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA.id } }))
        .amountReceived?.toString()).toBe("100");

      const invoiceB = await makeInvoice();
      const differentKeys = await Promise.allSettled([
        capture(invoiceB.id, "left-" + invoiceB.id),
        capture(invoiceB.id, "right-" + invoiceB.id),
      ]);
      expect(differentKeys.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.invoicePayment.count({ where: { invoiceId: invoiceB.id } })).toBe(1);
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceB.id } }))
        .amountReceived?.toString()).toBe("100");
    } finally {
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.$disconnect();
    }
  }, 60000);

  it("keeps invoice totals equal to the ledger during concurrent partial payments", async () => {
    const prisma = new PrismaClient();
    const workspace = await prisma.workspace.create({
      data: { name: "pg-partial-payment-" + randomUUID() },
    });
    const invoice = await prisma.invoice.create({
      data: {
        workspaceId: workspace.id,
        invoiceNumber: randomUUID(),
        financialYear: "2026-27",
        invoiceDate: new Date(),
        clientName: "Concurrent partial fixture",
        serviceDescription: "Production payment service",
        totalAmount: new Prisma.Decimal("100.00"),
        grandTotal: new Prisma.Decimal("100.00"),
        amountReceived: new Prisma.Decimal("0.00"),
        pdfPath: "",
      },
    });

    try {
      const results = await Promise.all([
        recordInvoicePayment({ workspaceId: workspace.id, userId: "audit-user", invoiceId: invoice.id, amount: 10, receivedAt: new Date(), method: "UPI", idempotencyKey: "partial-a-" + invoice.id }),
        recordInvoicePayment({ workspaceId: workspace.id, userId: "audit-user", invoiceId: invoice.id, amount: 10, receivedAt: new Date(), method: "UPI", idempotencyKey: "partial-b-" + invoice.id }),
        recordInvoicePayment({ workspaceId: workspace.id, userId: "audit-user", invoiceId: invoice.id, amount: 10, receivedAt: new Date(), method: "UPI", idempotencyKey: "partial-c-" + invoice.id }),
      ]);
      expect(results.every((result) => result.ok)).toBe(true);

      const [fresh, ledger] = await Promise.all([
        prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
        prisma.invoicePayment.aggregate({ where: { invoiceId: invoice.id, reversedAt: null }, _sum: { amount: true } }),
      ]);
      expect(fresh.status).toBe("PARTIALLY_PAID");
      expect(fresh.amountReceived?.toString()).toBe("30");
      expect(ledger._sum.amount?.toString()).toBe("30");
    } finally {
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.$disconnect();
    }
  }, 60_000);
});
