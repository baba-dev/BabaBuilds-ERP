import { describe, expect, it } from "vitest";

import { buildStatement, MAX_STATEMENT_ITEMS } from "@/lib/invoice/statement";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const inv = (over: Partial<Parameters<typeof buildStatement>[0]["invoices"][number]> & { number: string; date: Date }) => ({
  dueDate: null, total: 1000, status: "PENDING", payments: [], creditNotes: [], ...over,
});
const pay = (amount: number, receivedAt: string, extra: Partial<{ method: string; reference: string | null; reversedAt: Date | null }> = {}) => ({
  amount, receivedAt: d(receivedAt), method: "UPI", reference: null, reversedAt: null, ...extra,
});

describe("buildStatement", () => {
  const current = d("2026-05-01");

  it("lists only earlier invoices that still have a balance, oldest first", () => {
    const s = buildStatement({
      currentInvoiceDate: current,
      invoices: [
        inv({ number: "INV-2", date: d("2026-04-10"), total: 2000, payments: [pay(500, "2026-04-20")] }),
        inv({ number: "INV-1", date: d("2026-03-10"), total: 1000 }),
        inv({ number: "INV-3", date: d("2026-04-15"), total: 800, status: "PAID", payments: [pay(800, "2026-04-18")] }),
        inv({ number: "INV-4", date: d("2026-04-16"), total: 900, status: "VOID" }),
        inv({ number: "INV-5", date: d("2026-05-02"), total: 700 }),
      ],
    });
    expect(s.openItems.map((i) => [i.number, i.balance])).toEqual([["INV-1", 1000], ["INV-2", 1500]]);
    expect(s.previousBalance).toBe(2500);
  });

  it("subtracts credit notes (with their tax) and floors a balance at zero", () => {
    const s = buildStatement({
      currentInvoiceDate: current,
      invoices: [
        inv({ number: "INV-1", date: d("2026-03-10"), total: 1000, creditNotes: [{ number: "CN-1", amount: 1000, taxAmount: 180, issuedAt: d("2026-03-20") }] }),
        inv({ number: "INV-2", date: d("2026-03-12"), total: 1000, creditNotes: [{ number: "CN-2", amount: 300, taxAmount: 0, issuedAt: d("2026-03-25") }] }),
      ],
    });
    expect(s.openItems.map((i) => [i.number, i.balance])).toEqual([["INV-2", 700]]);
    expect(s.previousBalance).toBe(700);
  });

  it("ignores reversed payments", () => {
    const s = buildStatement({
      currentInvoiceDate: current,
      invoices: [inv({ number: "INV-1", date: d("2026-03-10"), total: 1000, payments: [pay(1000, "2026-03-15", { reversedAt: d("2026-03-16") })] })],
    });
    expect(s.previousBalance).toBe(1000);
    expect(s.payments).toEqual([]);
  });

  it("is empty for a client's first invoice", () => {
    const s = buildStatement({ currentInvoiceDate: current, invoices: [] });
    expect(s).toEqual({ previousBalance: 0, openItems: [], hiddenOpenItems: 0, payments: [], credits: [], sinceDate: null });
  });

  it("shows payments and credits since the previous invoice, not before", () => {
    const s = buildStatement({
      currentInvoiceDate: current,
      invoices: [
        inv({ number: "INV-1", date: d("2026-02-01"), total: 1000, payments: [pay(400, "2026-02-10")] }),
        inv({ number: "INV-2", date: d("2026-04-01"), total: 1000, payments: [pay(300, "2026-04-10", { reference: "UTR9" })], creditNotes: [{ number: "CN-1", amount: 100, taxAmount: 0, issuedAt: d("2026-04-12") }] }),
      ],
    });
    expect(s.sinceDate?.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(s.payments.map((p) => [p.amount, p.reference])).toEqual([[300, "UTR9"]]);
    expect(s.credits.map((c) => [c.number, c.amount])).toEqual([["CN-1", 100]]);
  });

  it("caps the open items shown but keeps the full previous balance", () => {
    const invoices = Array.from({ length: 12 }, (_, i) => inv({ number: `INV-${i + 1}`, date: d(`2026-03-${String(i + 1).padStart(2, "0")}`), total: 100 }));
    const s = buildStatement({ currentInvoiceDate: current, invoices });
    expect(s.openItems).toHaveLength(MAX_STATEMENT_ITEMS);
    expect(s.hiddenOpenItems).toBe(12 - MAX_STATEMENT_ITEMS);
    expect(s.previousBalance).toBe(1200);
    expect(s.openItems[0].number).toBe("INV-1");
  });

  it("rounds money to paise", () => {
    const s = buildStatement({ currentInvoiceDate: current, invoices: [inv({ number: "INV-1", date: d("2026-03-10"), total: 100.1, payments: [pay(33.33, "2026-03-11")] })] });
    expect(s.previousBalance).toBe(66.77);
  });
});
