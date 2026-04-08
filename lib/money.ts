import { Prisma } from "@prisma/client";

export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

export const MONEY_DECIMAL_PLACES = 2;

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

export function roundMoneyDecimal(value: MoneyInput, decimalPlaces = MONEY_DECIMAL_PLACES): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(decimalPlaces, Prisma.Decimal.ROUND_HALF_UP);
}

export function serializeMoney(value: MoneyInput, decimalPlaces = MONEY_DECIMAL_PLACES): string {
  return roundMoneyDecimal(value, decimalPlaces).toFixed(decimalPlaces);
}

export function sumMoney(values: MoneyInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, current) => acc.plus(toDecimal(current)), new Prisma.Decimal(0));
}
