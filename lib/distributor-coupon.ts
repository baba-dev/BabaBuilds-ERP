import type { Prisma } from "@prisma/client";

export function normalizeDistributorCouponCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}
