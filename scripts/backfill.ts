/** Operator-only PostgreSQL legacy backfills. Do not run during regular deploy. */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("DATABASE_URL required");
const target = new URL(raw);
if (!["postgres:", "postgresql:"].includes(target.protocol))
  throw new Error("PostgreSQL required");
if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname))
  throw new Error("Only loopback PostgreSQL is supported");
const name = decodeURIComponent(target.pathname.slice(1));
if (!/^bababuilds_erp(?:_[a-z0-9_]+)?$/.test(name))
  throw new Error("Refusing non-ERP database");
const environment = {
  ...process.env, PGHOST: target.hostname,
  PGPORT: target.port || "5432",
  PGUSER: decodeURIComponent(target.username),
  PGPASSWORD: decodeURIComponent(target.password), PGDATABASE: name
};
const directory = join(process.cwd(), "prisma", "backfills");
const scripts = readdirSync(directory).filter((s) => s.endsWith(".sql")).sort();
if (scripts.length !== 4) throw new Error("Unexpected backfill file count");
for (const script of scripts) {
  execFileSync("psql", ["-X", "-q", "-1", "-v", "ON_ERROR_STOP=1", "-f", join(directory, script)], {
    env: environment, stdio: ["ignore", "ignore", "inherit"]
  });
  console.log("Applied PostgreSQL backfill:", script);
}
