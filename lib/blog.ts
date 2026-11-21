import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const blogDir = path.join(process.cwd(), "content", "blog");

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified: string;
  author: string;
  tags: string[];
  /** Public path of the social/hero image, e.g. /help/invoice-designs/og.png */
  image: { src: string; alt: string; width: number; height: number };
  readMinutes: number;
};

export type BlogPost = BlogPostMeta & { content: string };

const str = (v: unknown, fallback = "") => (typeof v === "string" && v.trim() ? v.trim() : fallback);
const dateStr = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : str(v));

function parse(slug: string, raw: string): BlogPost | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const data = (yaml.load(match[1]) ?? {}) as Record<string, unknown>;
  const title = str(data.title);
  const description = str(data.description);
  const datePublished = dateStr(data.datePublished);
  if (!title || !description || !datePublished) return null;
  const image = (data.image ?? {}) as Record<string, unknown>;
  const content = match[2];
  const words = content.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title,
    description,
    datePublished,
    dateModified: dateStr(data.dateModified) || datePublished,
    author: str(data.author, "BabaBuilds Team"),
    tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === "string") : [],
    image: {
      src: str(image.src, "/help/invoice-designs/og.png"),
      alt: str(image.alt, title),
      width: typeof image.width === "number" ? image.width : 1200,
      height: typeof image.height === "number" ? image.height : 630,
    },
    readMinutes: Math.max(1, Math.round(words / 220)),
    content,
  };
}

/** Slugs are file names; reject anything that is not a plain slug so a URL can never reach another path. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function getBlogPost(slug: string): BlogPost | null {
  if (!SLUG.test(slug)) return null;
  try {
    return parse(slug, fs.readFileSync(path.join(blogDir, `${slug}.md`), "utf8"));
  } catch {
    return null;
  }
}

export function getAllBlogPosts(): BlogPost[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(blogDir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  return files
    .map((f) => getBlogPost(f.replace(/\.md$/, "")))
    .filter((p): p is BlogPost => p !== null)
    .sort((a, b) => b.datePublished.localeCompare(a.datePublished));
}
