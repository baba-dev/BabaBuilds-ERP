import { describe, expect, it } from "vitest";
import {
  decodeBankStatementBuffer,
  parseBankStatementFromBuffer,
  parseBankStatementFromRows,
  parseBankStatementFromText,
  sniffDelimiter,
} from "@/lib/reconciliation/bank-csv-parse";

describe("bank-csv-parse", () => {
  it("parses CSV with preamble customer details before the table", () => {
    const csv = `Account Statement
John Doe
123 Main St

Date,Description,Debit,Credit
2024-01-02,UPI MERCHANT,-,1500.00
2024-01-03,ATM WITHDRAWAL,2000.00,-
`;
    const r = parseBankStatementFromText(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.transactions.length).toBe(2);
    expect(r.transactions[0].type).toBe("CREDIT");
    expect(r.transactions[0].amount).toBe(1500);
    expect(r.transactions[1].type).toBe("DEBIT");
    expect(r.transactions[1].amount).toBe(2000);
  });

  it("supports semicolon delimiter (EU/IN style)", () => {
    const csv = `Datum;Verwendungszweck;Belastung;Gutschrift
01.02.2024;Rent;1200,50;
02.02.2024;Salary;;2500,00
`;
    const r = parseBankStatementFromText(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.transactions.length).toBe(2);
    expect(r.transactions[0].amount).toBeCloseTo(1200.5, 2);
    expect(r.transactions[1].type).toBe("CREDIT");
  });

  it("handles UTF-16 LE BOM buffer", () => {
    const inner = "Date,Description,Debit,Credit\r\n2024-03-01,Test,-,100.00\r\n";
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(inner, "utf16le")]);
    const r = parseBankStatementFromBuffer(buf);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.encoding).toBe("utf-16le");
    expect(r.transactions.length).toBe(1);
    expect(r.transactions[0].amount).toBe(100);
  });

  it("sniffs tab delimiter", () => {
    expect(sniffDelimiter("a\tb\tc")).toBe("\t");
  });

  it("parseBankStatementFromRows skips blank lines between preamble and header", () => {
    const rows = [
      ["Bank of Test"],
      ["Name: Jane"],
      [],
      ["Date", "Narration", "Debit", "Credit"],
      ["10/04/2024", "Interest", "", "12.34"],
    ];
    const r = parseBankStatementFromRows(rows);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.transactions.length).toBe(1);
    expect(r.transactions[0].amount).toBeCloseTo(12.34, 2);
  });
});

describe("decodeBankStatementBuffer", () => {
  it("falls back when UTF-8 yields replacement characters", () => {
    const bytes: number[] = [];
    for (let i = 0; i < 30; i++) bytes.push(0xc0, 0x80); // invalid sequences → U+FFFD
    const buf = Buffer.from(bytes);
    const { text, encoding } = decodeBankStatementBuffer(buf);
    expect(encoding).toBe("latin1");
    expect(text.length).toBeGreaterThan(0);
  });
});
