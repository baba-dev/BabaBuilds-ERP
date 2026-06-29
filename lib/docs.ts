import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const docsDir = path.join(process.cwd(), "content", "docs");

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
  order: number;
  datePublished?: string;
  dateModified?: string;
  category?: string;
  tags?: string[];
  icon?: string;
  estimatedMinutes?: number;
  isFeatured?: boolean;
}

export interface Doc extends DocMeta {
  content: string; // raw markdown string for MDXRemote
}

export interface DocsCategory {
  slug: string;
  title: string;
  description?: string;
  icon?: string;
  count: number;
}

export interface DocsSearchResult {
  slug: string;
  title: string;
  description: string;
  category?: string;
  icon?: string;
  estimatedMinutes?: number;
  score: number;
}

function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  if (!raw.startsWith("---")) {
    return { data: {}, content: raw };
  }

  const match = raw.match(/^---(?:\r?\n)([\s\S]*?)(?:\r?\n)---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    return { data: {}, content: raw };
  }

  const parsed = yaml.load(match[1]);
  const data =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  return {
    data,
    content: match[2] ?? "",
  };
}

function parseFrontmatterDate(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const next = value.filter((item): item is string => typeof item === "string").map((s) => s.trim()).filter(Boolean);
    return next.length ? next : undefined;
  }

  if (typeof value === "string") {
    const next = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return next.length ? next : undefined;
  }

  return undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

export function categoryToSlug(category: string): string {
  return category
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function slugToCategoryTitle(slug: string): string {
  return slug
    .trim()
    .replace(/-/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeDocMeta(slug: string, data: Record<string, unknown>): DocMeta {
  const title = typeof data.title === "string" && data.title.trim().length ? data.title : slug;
  const description = typeof data.description === "string" ? data.description : "";
  const category = typeof data.category === "string" && data.category.trim().length ? data.category.trim() : undefined;
  const tags = parseStringArray(data.tags);
  const icon = typeof data.icon === "string" && data.icon.trim().length ? data.icon.trim() : undefined;
  const estimatedMinutes = parseNumber(data.estimatedMinutes);
  const isFeatured = parseBoolean(data.isFeatured);

  return {
    slug,
    title,
    description,
    order: typeof data.order === "number" ? data.order : 99,
    datePublished: parseFrontmatterDate(data.datePublished),
    dateModified: parseFrontmatterDate(data.dateModified),
    category,
    tags,
    icon,
    estimatedMinutes,
    isFeatured,
  };
}

/**
 * Reads a single markdown doc by its slug (filename without .md).
 * Parses frontmatter (title, description, order) and returns the raw content.
 */
export function getDocBySlug(slug: string): Doc {
  const filePath = path.join(docsDir, `${slug}.md`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = parseFrontmatter(raw);

  return {
    ...normalizeDocMeta(slug, data as Record<string, unknown>),
    content,
  };
}

/**
 * Returns metadata for all docs in content/docs/, sorted by their `order` frontmatter field.
 */
export function getAllDocs(): DocMeta[] {
  if (!fs.existsSync(docsDir)) return [];

  const files = fs.readdirSync(docsDir).filter((f) => f.endsWith(".md"));

  return files
    .map((file) => {
      const slug = file.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(docsDir, file), "utf-8");
      const { data } = parseFrontmatter(raw);

      return normalizeDocMeta(slug, data as Record<string, unknown>);
    })
    .sort((a, b) => a.order - b.order);
}

export function getFeaturedDocs(docs: DocMeta[], limit = 9): DocMeta[] {
  const featured = docs.filter((doc) => doc.isFeatured);
  return (featured.length ? featured : docs).slice(0, limit);
}

export function groupDocsByCategory(docs: DocMeta[]): Array<{ category: DocsCategory; docs: DocMeta[] }> {
  const map = new Map<string, DocMeta[]>();
  for (const doc of docs) {
    const key = doc.category?.trim() || "General";
    const bucket = map.get(key);
    if (bucket) bucket.push(doc);
    else map.set(key, [doc]);
  }

  const groups = Array.from(map.entries()).map(([categoryTitle, items]) => {
    const category: DocsCategory = {
      slug: categoryToSlug(categoryTitle),
      title: categoryTitle,
      description: undefined,
      icon: items.find((d) => d.icon)?.icon,
      count: items.length,
    };

    const sortedDocs = [...items].sort((a, b) => a.order - b.order);
    return { category, docs: sortedDocs };
  });

  return groups.sort((a, b) => a.category.title.localeCompare(b.category.title));
}

function scoreDocAgainstQuery(doc: DocMeta, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const title = doc.title.toLowerCase();
  const desc = doc.description.toLowerCase();
  const slug = doc.slug.toLowerCase();
  const tags = (doc.tags ?? []).join(" ").toLowerCase();
  const category = (doc.category ?? "").toLowerCase();

  // Extremely fast heuristic scoring (good enough for a static docs portal).
  let score = 0;
  if (title === q) score += 1000;
  if (slug === q) score += 900;
  if (title.includes(q)) score += 220;
  if (slug.includes(q)) score += 180;
  if (tags.includes(q)) score += 140;
  if (category.includes(q)) score += 90;
  if (desc.includes(q)) score += 70;
  return score;
}

export function searchDocs(docs: DocMeta[], query: string, limit = 12): DocsSearchResult[] {
  const q = query.trim();
  if (!q) return [];

  return docs
    .map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      icon: doc.icon,
      estimatedMinutes: doc.estimatedMinutes,
      score: scoreDocAgainstQuery(doc, q),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
