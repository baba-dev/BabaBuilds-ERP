import { stateName } from "./states";
import { normalizeGstin } from "./gstin";
import type { ClassifiedInvoice } from "./classify";
import { r2 } from "./money";

/** An e-way bill is required to move goods worth more than ₹50,000 (consignment value, including tax). */
export const EWAY_THRESHOLD = 50000;

/** HSN-prefix guess, used only for lines that do not say whether they are stock items. */
export const isGoodsLine = (hsn: string) => !!hsn && !hsn.startsWith("99");

/** A line linked to a product is goods whatever its code looks like; other lines fall back to the prefix guess. */
export const lineIsGoods = (l: { hsn: string; goods?: boolean }) => (l.goods !== undefined ? l.goods : isGoodsLine(l.hsn));

export function needsEway(invoice: Pick<ClassifiedInvoice, "lines" | "value">): boolean {
  return invoice.value > EWAY_THRESHOLD && invoice.lines.some(lineIsGoods);
}

export type EwayTransport = { mode: 1 | 2 | 3 | 4; distanceKm: number; vehicleNo: string; transporterId?: string; fromPin: string; toPin: string; vehicleType?: "R" | "O" };

export type EwayParty = { gstin: string | null; stateCode: string };

/** Bulk-upload JSON for the e-way bill portal. Only goods lines go in; services never need an e-way bill. */
export function buildEwayBulkJson(args: { userGstin: string; seller: EwayParty; invoices: Array<{ invoice: ClassifiedInvoice; buyer: EwayParty; transport: EwayTransport }> }) {
  const dmy = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  return {
    version: "1.0.0621",
    billLists: args.invoices.map(({ invoice, buyer, transport }) => {
      const goods = invoice.lines.filter(lineIsGoods);
      const sum = (k: "igst" | "cgst" | "sgst" | "cess") => r2(goods.reduce((s, l) => s + l[k], 0));
      const taxable = r2(goods.reduce((s, l) => s + l.taxable, 0));
      return {
        userGstin: normalizeGstin(args.userGstin), supplyType: "O", subSupplyType: 1, docType: "INV", docNo: invoice.number, docDate: dmy(invoice.date),
        fromGstin: normalizeGstin(args.seller.gstin), fromStateCode: Number(args.seller.stateCode), actFromStateCode: Number(args.seller.stateCode), fromPincode: Number(transport.fromPin),
        toGstin: buyer.gstin ? normalizeGstin(buyer.gstin) : "URP", toStateCode: Number(buyer.stateCode), actToStateCode: Number(buyer.stateCode), toPincode: Number(transport.toPin),
        transactionType: 1, totalValue: taxable, cgstValue: sum("cgst"), sgstValue: sum("sgst"), igstValue: sum("igst"), cessValue: sum("cess"), totInvValue: invoice.value,
        transporterId: transport.transporterId ?? "", transMode: String(transport.mode), transDistance: String(transport.distanceKm), vehicleNo: transport.vehicleNo.replace(/\s+/g, "").toUpperCase(), vehicleType: transport.vehicleType ?? "R",
        itemList: goods.map((l) => ({ productName: l.description.slice(0, 100) || "Goods", productDesc: l.description.slice(0, 100), hsnCode: Number(l.hsn), quantity: l.quantity, qtyUnit: "OTH", taxableAmount: l.taxable, cgstRate: l.cgst ? l.rate / 2 : 0, sgstRate: l.sgst ? l.rate / 2 : 0, igstRate: l.igst ? l.rate : 0, cessRate: 0 })),
      };
    }),
    meta: { generatedFor: stateName(args.seller.stateCode) },
  };
}

export function validateTransport(t: Partial<EwayTransport>): string[] {
  const errs: string[] = [];
  if (!t.vehicleNo || !/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(t.vehicleNo.replace(/\s+/g, "").toUpperCase())) errs.push("VEHICLE_NO");
  if (!t.fromPin || !/^\d{6}$/.test(t.fromPin)) errs.push("FROM_PIN");
  if (!t.toPin || !/^\d{6}$/.test(t.toPin)) errs.push("TO_PIN");
  if (!t.distanceKm || t.distanceKm < 1 || t.distanceKm > 4000) errs.push("DISTANCE");
  return errs;
}
