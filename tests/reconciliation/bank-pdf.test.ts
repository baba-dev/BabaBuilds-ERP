// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ text: "" }));
vi.mock("pdf-parse", () => ({
  PDFParse: class {
    async getText() { return { text: mocks.text }; }
    async destroy() { /* nothing to release */ }
  },
}));

beforeEach(() => { mocks.text = ""; });

describe("parseBankPdfToTransactions", () => {
  it("reads statement rows from PDF text (it used to return nothing because of a missing export)", async () => {
    mocks.text = ["Date,Narration,Withdrawal,Deposit,Balance", "01/11/2026,UPI AWS INDIA,18500.00,,81500.00", "03/11/2026,NEFT ACME STARTUPS,,50000.00,131500.00"].join("\n");
    const { parseBankPdfToTransactions } = await import("@/lib/reconciliation/bank-pdf");
    const rows = await parseBankPdfToTransactions(Buffer.from("x"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ amount: 18500, type: "DEBIT" });
    expect(rows[1]).toMatchObject({ amount: 50000, type: "CREDIT" });
    expect(rows[0].parseFlags).toMatchObject({ source: "PDF" });
  });

  it("treats runs of spaces as column breaks", async () => {
    mocks.text = ["Date    Narration    Withdrawal    Deposit    Balance", "01/11/2026    UPI AWS INDIA    18500.00        81500.00", "03/11/2026    NEFT ACME STARTUPS        50000.00    131500.00"].join("\n");
    const { parseBankPdfToTransactions } = await import("@/lib/reconciliation/bank-pdf");
    const rows = await parseBankPdfToTransactions(Buffer.from("x"));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("returns nothing for a scanned PDF with no text", async () => {
    mocks.text = "  ";
    const { parseBankPdfToTransactions } = await import("@/lib/reconciliation/bank-pdf");
    expect(await parseBankPdfToTransactions(Buffer.from("x"))).toEqual([]);
  });
});
