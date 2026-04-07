import { Prisma } from "@prisma/client";

export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

export function toDecimal(value: MoneyInput): Prisma.Decimal {
  if (value === null || value === undefined || value === "") {
    return new Prisma.Decimal(0);
  }

  if (value instanceof Prisma.Decimal) return value;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return new Prisma.Decimal(0);
    return new Prisma.Decimal(value);
  }

  return new Prisma.Decimal(value);
}

export function decimalToNumber(value: MoneyInput): number {
  return toDecimal(value).toNumber();
}

export function sumMoney(values: MoneyInput[]): Prisma.Decimal {
  return values.reduce((acc, current) => acc.plus(toDecimal(current)), new Prisma.Decimal(0));
}
