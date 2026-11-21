const VPA = /^[a-z0-9._-]{2,50}@[a-z][a-z0-9.-]{1,20}$/;
const CONTROL = /[\u0000-\u001f\u007f]/g;

/** A UPI ID such as "shop@okhdfc": lower-cased, up to 60 characters, no spaces. Anything else is null. */
export const normalizeUpiVpa = (input: unknown): string | null => {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  return value.length <= 60 && VPA.test(value) ? value : null;
};

/** The name shown to the payer in their UPI app: 1 to 60 characters, control characters removed. */
export const normalizePayeeName = (input: unknown): string | null => {
  if (typeof input !== "string") return null;
  const value = input.replace(CONTROL, "").replace(/\s+/g, " ").trim();
  return value.length >= 1 && value.length <= 60 ? value : null;
};

/**
 * The standard UPI payment link that every UPI app opens: payee, name, exact amount, INR and a short reference.
 * The amount is left out when it is missing or not positive, so the payer types it. Null for an invalid UPI ID.
 */
export const buildUpiUri = (args: { vpa: string; payeeName?: string | null; amount?: number | null; note?: string | null }): string | null => {
  const vpa = normalizeUpiVpa(args.vpa);
  if (!vpa) return null;
  const parts = [`pa=${encodeURIComponent(vpa)}`];
  const name = normalizePayeeName(args.payeeName);
  if (name) parts.push(`pn=${encodeURIComponent(name)}`);
  const amount = args.amount;
  if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) parts.push(`am=${(Math.round((amount + Number.EPSILON) * 100) / 100).toFixed(2)}`);
  parts.push("cu=INR");
  const note = typeof args.note === "string" ? args.note.replace(CONTROL, "").trim().slice(0, 50) : "";
  if (note) parts.push(`tn=${encodeURIComponent(note)}`);
  return `upi://pay?${parts.join("&")}`;
};
