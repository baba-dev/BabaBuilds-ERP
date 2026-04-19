import type { PurchaseOrder } from "@prisma/client";

export type PoMatchCandidate = {
  purchaseOrder: PurchaseOrder;
  score: number;
  reasons: string[];
};

export function rankPurchaseOrdersForDebit(args: {
  orders: PurchaseOrder[];
  amount: number;
  narration: string;
}): PoMatchCandidate[] {
  const amount = Math.round(args.amount * 100) / 100;
  const hay = args.narration.toUpperCase();
  const out: PoMatchCandidate[] = [];

  for (const po of args.orders) {
    if (po.status === "CANCELLED") continue;
    const poTotal = Math.round(Number(po.totalAmount) * 100) / 100;
    if (Math.abs(poTotal - amount) > 0.05 && poTotal > 0) continue;

    let score = 40;
    const reasons: string[] = [];
    if (poTotal > 0 && Math.abs(poTotal - amount) <= 0.05) {
      score += 40;
      reasons.push("amount_matches_po_total");
    }

    const num = po.poNumber.trim().toUpperCase();
    if (num && hay.includes(num)) {
      score += 50;
      reasons.push("po_number_in_narration");
    }

    const sup = po.supplier.trim().toUpperCase();
    if (sup.length >= 4 && hay.includes(sup.slice(0, 16))) {
      score += 20;
      reasons.push("supplier_in_narration");
    }

    if (score < 50) continue;
    out.push({ purchaseOrder: po, score, reasons });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 5);
}
