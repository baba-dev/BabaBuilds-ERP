import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const docsDir = path.join(process.cwd(), 'content', 'docs');

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
  order: number;
  datePublished?: string;
  dateModified?: string;
}

export interface Doc extends DocMeta {
  content: string; // raw markdown string for MDXRemote
}

function parseFrontmatterDate(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return undefined;
}

/**
 * Reads a single markdown doc by its slug (filename without .md).
 * Parses frontmatter (title, description, order) and returns the raw content.
 */
export function getDocBySlug(slug: string): Doc {
  const filePath = path.join(docsDir, `${slug}.md`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);

  return {
    slug,
    title: data.title || slug,
    description: data.description || '',
    order: typeof data.order === 'number' ? data.order : 99,
    datePublished: parseFrontmatterDate(data.datePublished),
    dateModified: parseFrontmatterDate(data.dateModified),
    content,
  };
}

/**
 * Returns metadata for all docs in content/docs/, sorted by their `order` frontmatter field.
 */
export function getAllDocs(): DocMeta[] {
  if (!fs.existsSync(docsDir)) return [];

  const files = fs.readdirSync(docsDir).filter((f) => f.endsWith('.md'));

  return files
    .map((file) => {
      const slug = file.replace(/\.md$/, '');
      const raw = fs.readFileSync(path.join(docsDir, file), 'utf-8');
      const { data } = matter(raw);

      return {
        slug,
        title: data.title || slug,
        description: data.description || '',
        order: typeof data.order === 'number' ? data.order : 99,
        datePublished: parseFrontmatterDate(data.datePublished),
        dateModified: parseFrontmatterDate(data.dateModified),
      };
    })
    .sort((a, b) => a.order - b.order);
}
