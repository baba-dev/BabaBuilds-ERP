import { describe, expect, it } from "vitest";
import {
  computeBankRowImportHash,
  normalizeDescriptionForHash,
} from "@/lib/reconciliation/bank-import-hash";

describe("bank-import-hash", () => {
  it("normalizes description for stable hashing", () => {
    expect(normalizeDescriptionForHash("  UPI/Dr  ABC  ")).toBe("UPIDR ABC");
  });

  it("same logical row hashes equal after punctuation changes", () => {
    const a = computeBankRowImportHash({
      workspaceId: "w1",
      accountId: "a1",
      dateIso: "2024-01-02",
      amountSigned: "100.00",
      description: "NEFT — INV-1",
      reference: "UTR123",
    });
    const b = computeBankRowImportHash({
      workspaceId: "w1",
      accountId: "a1",
      dateIso: "2024-01-02",
      amountSigned: "100.00",
      description: "NEFT INV1",
      reference: "utr123",
    });
    expect(a).toBe(b);
  });
});
