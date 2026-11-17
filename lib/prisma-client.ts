import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

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
  const max = Number(process.env.ERP_PG_POOL_MAX ?? '5');
  if (!Number.isInteger(max) || max < 1 || max > 20) {
    throw new Error('ERP_PG_POOL_MAX must be an integer from 1 to 20');
  }
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString, max, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    }),
  });
}
