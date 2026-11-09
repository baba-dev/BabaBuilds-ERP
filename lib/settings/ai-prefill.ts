/** The AI assistant can hand values to /settings through sessionStorage. They stay usable for two minutes, so they survive moving between sections. */
const WINDOW_MS = 120_000;

export const PREFILL_KEYS = {
  business: ["companyName", "proprietorName", "address", "email", "phone", "website"],
  tax: ["panNumber", "udyamNumber", "gstin"],
  banking: ["bankName", "accountName", "accountNumber", "ifscCode"],
} as const;

export type PrefillSection = keyof typeof PREFILL_KEYS;

export function readAiPrefill(now = Date.now()): Record<string, string> | null {
  try {
    const raw = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem("erp_ai_payload");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { path?: string; data?: Record<string, unknown>; timestamp?: number };
    if (parsed.path !== "/settings" || !parsed.data || typeof parsed.timestamp !== "number" || now - parsed.timestamp > WINDOW_MS) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.data)) if (typeof v === "string" && v.trim()) out[k] = v.trim();
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** Sections (other than the given one) that have suggested values waiting. */
export function pendingPrefillSections(prefill: Record<string, string> | null, except: PrefillSection): PrefillSection[] {
  if (!prefill) return [];
  return (Object.keys(PREFILL_KEYS) as PrefillSection[]).filter((s) => s !== except && PREFILL_KEYS[s].some((k) => prefill[k]));
}
