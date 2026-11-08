import { validateGstin, normalizeGstin } from "./gstin";

/**
 * "Is this customer registered?" needs a GST Suvidha Provider (GSP) or the e-invoice IRP's public search API.
 * Neither is wired up yet, so this is the seam: implement `GspProvider`, return it from `getGspProvider()` and the
 * lookup route and the client form start working without further changes.
 */
export type GstinRegistration = {
  gstin: string;
  legalName: string | null;
  tradeName: string | null;
  status: "ACTIVE" | "CANCELLED" | "SUSPENDED" | "INACTIVE" | "UNKNOWN";
  stateCode: string;
  registrationType: string | null;
  address: string | null;
  checkedAt: string;
};

export interface GspProvider {
  readonly name: string;
  lookupGstin(gstin: string): Promise<GstinRegistration>;
}

export function getGspProvider(): GspProvider | null {
  return null;
}

export type LookupOutcome =
  | { ok: true; registration: GstinRegistration }
  | { ok: false; code: "GSTIN_INVALID" | "GSP_NOT_CONFIGURED" | "GSP_FAILED"; message: string };

export async function lookupRegistration(raw: string): Promise<LookupOutcome> {
  const gstin = normalizeGstin(raw);
  const check = validateGstin(gstin);
  if (!check.valid) return { ok: false, code: "GSTIN_INVALID", message: "The GSTIN is not valid, so there is nothing to look up." };
  const provider = getGspProvider();
  if (!provider) return { ok: false, code: "GSP_NOT_CONFIGURED", message: "No GST provider is connected, so registration cannot be verified automatically." };
  try {
    return { ok: true, registration: await provider.lookupGstin(gstin) };
  } catch {
    return { ok: false, code: "GSP_FAILED", message: "The GST provider did not answer. Try again in a moment." };
  }
}
