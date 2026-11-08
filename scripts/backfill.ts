/**
 * Applies every prisma/backfills/*.sql file (in name order) to the current database. All files are idempotent.
 * Needed for databases created with `prisma db push` (production), where migration SQL is never run.
 *
 *   npm run backfill
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

async function main() {
  const dir = path.join(process.cwd(), "prisma", "backfills");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const sql = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  const statements = sql
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
      console.log(`[backfill] ${changed} row(s): ${statement.split("\n")[0].slice(0, 90)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[backfill] failed", error);
  process.exit(1);
});
