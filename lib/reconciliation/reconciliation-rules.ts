import type { ParsedBankTransaction } from "./bank-csv-parse";

export type BankRuleRow = {
  priority: number;
  pattern: string;
  matchTxnType: string;
  setCategory: string | null;
  setVendor: string | null;
  setInternalTransfer: boolean;
};

export type RuleAugmentedTxn = ParsedBankTransaction & {
  ruleCategory?: string;
  ruleVendor?: string;
  ruleInternalTransfer?: boolean;
};

export function applyReconciliationRules(
  rows: ParsedBankTransaction[],
  rules: BankRuleRow[],
): RuleAugmentedTxn[] {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  return rows.map((row) => {
    const hay = `${row.description} ${row.reference ?? ""}`.toLowerCase();
    const out: RuleAugmentedTxn = { ...row };
    for (const r of sorted) {
      const p = r.pattern.trim().toLowerCase();
      if (!p) continue;
      if (r.matchTxnType === "DEBIT" && row.type !== "DEBIT") continue;
      if (r.matchTxnType === "CREDIT" && row.type !== "CREDIT") continue;
      if (!hay.includes(p)) continue;
      if (r.setCategory) out.ruleCategory = r.setCategory;
      if (r.setVendor) out.ruleVendor = r.setVendor;
      if (r.setInternalTransfer) out.ruleInternalTransfer = true;
      break;
    }
    return out;
  });
}
