import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { serializeMoney, sumMoney, toDecimal } from "./money";

const calculateEstimatedTaxDecimal = (taxableIncome: Prisma.Decimal): Prisma.Decimal => {
  if (taxableIncome.lte(700000)) {
    return new Prisma.Decimal(0);
  }

  const slabs: Array<{ floor: number; width: number | null; rate: number }> = [
    { floor: 300000, width: 300000, rate: 0.05 },
    { floor: 600000, width: 300000, rate: 0.1 },
    { floor: 900000, width: 300000, rate: 0.15 },
    { floor: 1200000, width: 300000, rate: 0.2 },
    { floor: 1500000, width: null, rate: 0.3 },
  ];

  return slabs.reduce((tax, slab) => {
    const floor = new Prisma.Decimal(slab.floor);
    if (taxableIncome.lte(floor)) return tax;

    const slabWidth = slab.width === null
      ? taxableIncome.minus(floor)
      : Prisma.Decimal.min(taxableIncome.minus(floor), new Prisma.Decimal(slab.width));

    if (slabWidth.lte(0)) return tax;
    return tax.plus(slabWidth.mul(slab.rate));
  }, new Prisma.Decimal(0));
};

test("partial payment outstanding keeps paise precision", () => {
  const billed = toDecimal("1000.05");
  const received = toDecimal("333.37");

  const outstanding = billed.minus(received);

  assert.equal(serializeMoney(outstanding), "666.68");
});

test("cumulative sums avoid floating point drift", () => {
  const total = sumMoney(["0.10", "0.20", "0.30"]);

  assert.equal(serializeMoney(total), "0.60");
});

test("tax slab calculation is stable around thresholds", () => {
  const taxAtThreshold = calculateEstimatedTaxDecimal(new Prisma.Decimal("700000.00"));
  const taxAboveThreshold = calculateEstimatedTaxDecimal(new Prisma.Decimal("700000.01"));

  assert.equal(serializeMoney(taxAtThreshold), "0.00");
  assert.equal(serializeMoney(taxAboveThreshold), "25000.00");
});
