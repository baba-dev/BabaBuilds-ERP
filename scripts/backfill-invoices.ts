/**
 * Applies prisma/backfills/invoice-rework.sql to the current database (idempotent).
 * Needed for databases created with `prisma db push` (production), where migration SQL is never run.
 *
 *   npm run backfill:invoices
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

async function main() {
  const file = path.join(process.cwd(), "prisma", "backfills", "invoice-rework.sql");
  const statements = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);

  const prisma = new PrismaClient();
  try {
    for (const statement of statements) {
      const changed = await prisma.$executeRawUnsafe(statement);
      console.log(`[backfill:invoices] ${changed} row(s): ${statement.split("\n")[0].slice(0, 90)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[backfill:invoices] failed", error);
  process.exit(1);
});
