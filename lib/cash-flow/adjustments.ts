export type AdjustmentFieldError = { field: string; code: string };
export type AdjustmentData = { date?: Date; amount?: number; direction?: "INFLOW" | "OUTFLOW"; reason?: string; category?: string | null };

const DAY = 86_400_000;

/** Validate a manual adjustment. A date may be up to a year back (to correct the record) and three years ahead; the amount is always positive and the direction says which way it moves. */
export function normalizeAdjustment(raw: unknown, opts: { partial: boolean; now?: Date }): { ok: true; data: AdjustmentData } | { ok: false; fields: AdjustmentFieldError[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const now = opts.now ?? new Date();
  const fields: AdjustmentFieldError[] = [];
  const data: AdjustmentData = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(r, k);

  if (!opts.partial || has("date")) {
    const d = new Date(String(r.date ?? ""));
    if (!r.date || Number.isNaN(d.getTime())) fields.push({ field: "date", code: "DATE" });
    else if (d.getTime() < now.getTime() - 366 * DAY || d.getTime() > now.getTime() + 3 * 366 * DAY) fields.push({ field: "date", code: "DATE_RANGE" });
    else data.date = d;
  }
  if (!opts.partial || has("amount")) {
    const a = typeof r.amount === "number" ? r.amount : Number(r.amount);
    if (!Number.isFinite(a) || a <= 0) fields.push({ field: "amount", code: "AMOUNT" });
    else if (a > 1e12) fields.push({ field: "amount", code: "AMOUNT_RANGE" });
    else data.amount = Math.round(a * 100) / 100;
  }
  if (!opts.partial || has("direction")) {
    if (r.direction === "INFLOW" || r.direction === "OUTFLOW") data.direction = r.direction;
    else fields.push({ field: "direction", code: "DIRECTION" });
  }
  if (!opts.partial || has("reason")) {
    const reason = typeof r.reason === "string" ? r.reason.trim() : "";
    if (reason.length < 2) fields.push({ field: "reason", code: "REQUIRED" });
    else if (reason.length > 200) fields.push({ field: "reason", code: "TOO_LONG" });
    else data.reason = reason;
  }
  if (!opts.partial || has("category")) {
    const c = typeof r.category === "string" ? r.category.trim() : "";
    data.category = c ? c.slice(0, 60) : null;
  }
  return fields.length ? { ok: false, fields } : { ok: true, data };
}
