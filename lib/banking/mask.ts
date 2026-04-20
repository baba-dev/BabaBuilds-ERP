export function normalizeRoutingCode(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();
  return normalized || null;
}

export function maskAccountNumber(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.replace(/\s+/g, "").trim();
  if (!raw) return null;
  if (raw.length <= 4) return raw;
  return `${"•".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
}

export function toLast4(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.replace(/\s+/g, "").trim();
  if (!raw) return null;
  return raw.slice(-4);
}
