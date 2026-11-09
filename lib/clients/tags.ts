const MAX_TAGS = 12;
const MAX_LEN = 24;

/** Tags are stored as "|vip|agency|" so a database LIKE '%|vip|%' finds them exactly. */
export function parseTags(stored: string | null | undefined): string[] {
  return (stored ?? "").split("|").map((t) => t.trim()).filter(Boolean);
}

export function normalizeTag(raw: string): string {
  return raw.toLowerCase().replace(/[|,]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
}

export function serializeTags(tags: Iterable<string>): string {
  const out: string[] = [];
  for (const t of tags) { const n = normalizeTag(t); if (n && !out.includes(n)) out.push(n); if (out.length >= MAX_TAGS) break; }
  return out.length ? `|${out.join("|")}|` : "";
}

export const tagLike = (tag: string) => `%|${normalizeTag(tag)}|%`;
