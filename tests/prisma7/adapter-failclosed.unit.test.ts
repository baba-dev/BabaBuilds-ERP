import { afterEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from '@/lib/prisma-client';
const originalUrl = process.env.DATABASE_URL;
const originalMax = process.env.ERP_PG_POOL_MAX;
afterEach(() => {
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
  if (originalMax === undefined) delete process.env.ERP_PG_POOL_MAX;
  else process.env.ERP_PG_POOL_MAX = originalMax;
});
describe('Prisma 7 PostgreSQL adapter safety', () => {
  it('rejects missing DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    expect(() => createPrismaClient()).toThrow(/DATABASE_URL/);
  });
  it('rejects non-PostgreSQL connection strings', () => {
    process.env.DATABASE_URL = 'file:./dev.db';
    expect(() => createPrismaClient()).toThrow(/PostgreSQL/);
  });
  it('fails closed for excessively large pools', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/bababuilds_erp_ci';
    process.env.ERP_PG_POOL_MAX = '999';
    expect(() => createPrismaClient()).toThrow(/ERP_PG_POOL_MAX/);
  });
});
