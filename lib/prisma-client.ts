import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/** Default pool size per server process. Five was too tight: a page that fans out several
 *  queries, or one slow request, queued every other request behind the 5s connect timeout. */
export const DEFAULT_PG_POOL_MAX = 10;
export const MAX_PG_POOL_MAX = 20;

/** Pure and exported for tests. Unset or blank falls back to the default; anything else must be valid. */
export function resolvePoolMax(raw: string | undefined = process.env.ERP_PG_POOL_MAX): number {
  const value = raw?.trim();
  const max = value ? Number(value) : DEFAULT_PG_POOL_MAX;
  if (!Number.isInteger(max) || max < 1 || max > MAX_PG_POOL_MAX) {
    throw new Error(`ERP_PG_POOL_MAX must be an integer from 1 to ${MAX_PG_POOL_MAX}`);
  }
  return max;
}

/** Prisma 7 client factory: PostgreSQL only, bounded connection pool. */
export function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for Prisma PostgreSQL');
  let url: URL;
  try { url = new URL(connectionString); }
  catch { throw new Error('Invalid PostgreSQL DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Prisma requires a PostgreSQL DATABASE_URL');
  }
  const max = resolvePoolMax();
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString, max, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
      // Visible in pg_stat_activity so pool pressure can be attributed to the ERP.
      application_name: 'bababuilds-erp',
    }),
  });
}
