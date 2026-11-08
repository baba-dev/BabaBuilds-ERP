import { isStateCode } from "./states";
import { validateGstin } from "./gstin";

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
