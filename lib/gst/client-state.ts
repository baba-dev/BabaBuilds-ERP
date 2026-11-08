import { isStateCode } from "./states";
import { looksLikePan, validateGstin } from "./gstin";

/**
 * State to store for a client: a valid GSTIN's own state code always wins (it is the legal place of supply for
 * registered recipients); otherwise the chosen state if it is a real GST code, else none.
 */
export function resolveClientGstState(rawState: FormDataEntryValue | string | null | undefined, taxId: string | null | undefined): string | null {
  const check = validateGstin(taxId);
  if (check.valid) return check.stateCode;
  const state = typeof rawState === "string" ? rawState.trim() : "";
  return isStateCode(state) ? state : null;
}

export type ClientGstInput =
  | { ok: true; data: { gstStateCode: string | null; gstSupplyOverride: "SEZ_WP" | "SEZ_WOP" | null; gstReverseCharge: boolean } }
  | { ok: false; code: "GSTIN_INVALID" | "SEZ_NEEDS_GSTIN"; message: string };

const isDomestic = (country: string | null | undefined) => {
  const c = (country ?? "").trim().toUpperCase();
  return c === "" || c === "IN" || c === "INDIA";
};

/**
 * Everything GST-related on a client form: the state (read from the GSTIN when there is one), plus the standing
 * treatment (SEZ, reverse charge) that new invoices inherit. Foreign customers' tax IDs are never held to GSTIN rules.
 */
export function parseClientGstInput(args: { country: string | null | undefined; taxId: string | null | undefined; state: FormDataEntryValue | string | null | undefined; supplyOverride: FormDataEntryValue | string | null | undefined; reverseCharge: FormDataEntryValue | string | null | undefined }): ClientGstInput {
  const domestic = isDomestic(args.country);
  const taxId = (args.taxId ?? "").trim();
  const check = validateGstin(taxId);
  if (domestic && taxId && !check.valid && !looksLikePan(taxId)) {
    return { ok: false, code: "GSTIN_INVALID", message: "That is not a valid GSTIN. Check the 15 characters, or enter a PAN for an unregistered customer." };
  }
  const so = typeof args.supplyOverride === "string" ? args.supplyOverride : "";
  const supplyOverride = so === "SEZ_WP" || so === "SEZ_WOP" ? so : null;
  if (supplyOverride && !(domestic && check.valid)) {
    return { ok: false, code: "SEZ_NEEDS_GSTIN", message: "A SEZ customer needs a valid GSTIN." };
  }
  return {
    ok: true,
    data: {
      gstStateCode: domestic ? resolveClientGstState(args.state, taxId) : null,
      gstSupplyOverride: supplyOverride,
      gstReverseCharge: args.reverseCharge === "true" && domestic,
    },
  };
}
