import { describe, expect, it } from "vitest";

function summarizeDrivers(args: {
  lines: Array<{ direction: "INFLOW" | "OUTFLOW"; classification: "ACTUAL" | "EXPECTED" | "PREDICTED" | "COMMITTED" | "MANUAL"; sourceType: string; sourceId?: string | null; title: string; amount: number }>;
  direction: "INFLOW" | "OUTFLOW";
  topN?: number;
}) {
  const topN = args.topN ?? 5;
  const proj = args.lines.filter((l) => l.direction === args.direction && l.classification !== "ACTUAL");
  const act = args.lines.filter((l) => l.direction === args.direction && l.classification === "ACTUAL");

  const keyFor = (l: (typeof args.lines)[number]) => `${l.sourceType}:${l.sourceId ?? l.title}`;
  const titleFor = (l: (typeof args.lines)[number]) => l.title;

  const agg = (rows: typeof proj) => {
    const map = new Map<string, { key: string; sourceType: string; title: string; amount: number }>();
    for (const r of rows) {
      const key = keyFor(r);
      const prev = map.get(key);
      map.set(key, {
        key,
        sourceType: r.sourceType,
        title: prev?.title ?? titleFor(r),
        amount: (prev?.amount ?? 0) + Number(r.amount ?? 0),
      });
    }
    return map;
  };

  const projAgg = agg(proj);
  const actAgg = agg(act as any);

  const out = Array.from(new Set([...projAgg.keys(), ...actAgg.keys()])).map((key) => {
    const p = projAgg.get(key);
    const a = actAgg.get(key);
    const projectedAmount = p?.amount ?? 0;
    const actualAmount = a?.amount ?? 0;
    const delta = actualAmount - projectedAmount;
    return { key, sourceType: (p?.sourceType ?? a?.sourceType)!, title: (p?.title ?? a?.title)!, projectedAmount, actualAmount, delta };
  });

  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, topN);
}

describe("cash-flow variance attribution (unit)", () => {
  it("ranks top drivers by absolute delta", () => {
    const lines = [
      { direction: "INFLOW" as const, classification: "EXPECTED" as const, sourceType: "INVOICE", sourceId: "inv1", title: "Invoice 1", amount: 1000 },
      { direction: "INFLOW" as const, classification: "ACTUAL" as const, sourceType: "BANK_TRANSACTION", sourceId: "tx1", title: "Deposit", amount: 200 },
      { direction: "INFLOW" as const, classification: "ACTUAL" as const, sourceType: "INVOICE", sourceId: "inv1", title: "Invoice 1", amount: 300 },
      { direction: "INFLOW" as const, classification: "EXPECTED" as const, sourceType: "RETAINER", sourceId: "r1", title: "Retainer", amount: 400 },
      { direction: "INFLOW" as const, classification: "ACTUAL" as const, sourceType: "RETAINER", sourceId: "r1", title: "Retainer", amount: 450 },
    ];

    const top = summarizeDrivers({ lines, direction: "INFLOW", topN: 2 });
    expect(top).toHaveLength(2);
    // Invoice delta: 300 - 1000 = -700 (abs 700)
    expect(top[0]!.key).toBe("INVOICE:inv1");
    // Retainer delta: 450 - 400 = +50 (abs 50) vs tx delta: 200 - 0 = +200 (abs 200)
    expect(top[1]!.key).toBe("BANK_TRANSACTION:tx1");
  });
});

