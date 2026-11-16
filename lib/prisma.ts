// Fail closed if staging is accidentally pointed at live ERP or another app DB.
if (process.env.ERP_STAGING_MODE === '1') {
  const raw = process.env.DATABASE_URL || '';
  let allowed = false;
  try {
    const parsed = new URL(raw);
    const name = decodeURIComponent(parsed.pathname.slice(1));
    const port = process.env.PORT || '3101';
    const origin = new URL(process.env.NEXTAUTH_URL || '');
    allowed = ['postgres:', 'postgresql:'].includes(parsed.protocol) &&
      /^(?:bababuilds_erp_staging_[a-z0-9]{4,12})$/.test(name) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) &&
      origin.port === port && process.env.HOSTNAME === '127.0.0.1';
  } catch { /* fail closed */ }
  if (!allowed) {
    throw new Error('ERP_STAGING_CONFIG_INVALID: refusing production or non-loopback database');
  }
}

import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Classic, stable Prisma 6 instantiation
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;