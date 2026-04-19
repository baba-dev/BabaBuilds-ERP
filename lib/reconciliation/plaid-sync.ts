import type { ParsedBankTransaction } from "./bank-csv-parse";

/** Map Plaid transaction to internal row (Plaid: positive amount = money out). */
export function plaidTransactionToParsed(tx: {
  transaction_id: string;
  date: string;
  name: string;
  amount: number;
  iso_currency_code?: string | null;
  unofficial_currency_code?: string | null;
}): ParsedBankTransaction {
  const plaidAmt = Number(tx.amount);
  const signed = -plaidAmt;
  const type: "DEBIT" | "CREDIT" = signed < 0 ? "DEBIT" : "CREDIT";
  const dateIso = tx.date ? new Date(tx.date).toISOString() : new Date().toISOString();
  return {
    id: tx.transaction_id,
    date: dateIso,
    description: (tx.name || "Plaid transaction").slice(0, 2000),
    amount: Math.abs(signed),
    type,
    providerTransactionId: tx.transaction_id,
    originalCurrency: tx.iso_currency_code ?? tx.unofficial_currency_code ?? undefined,
    parseFlags: { source: "PLAID" },
  };
}
