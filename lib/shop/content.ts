/**
 * lib/shop/content.ts
 *
 * Helpers for parsing, validating, and persisting the public-shop "content"
 * fields stored on `BusinessProfile`:
 *
 *   - shopAnnouncement   (string | null)
 *   - shopAboutMd        (string | null)            — markdown source
 *   - shopFooterNote     (string | null)
 *   - shopSocialJson     (string | null)            — JSON: SocialLink[]
 *   - shopFaqJson        (string | null)            — JSON: FaqEntry[]
 *   - shopShowAiAssist   (boolean)
 *
 * These are admin-editable from the dashboard and consumed by the public
 * `/shop/<slug>` page. We store JSON-as-text to stay portable across SQLite
 * (dev) and PostgreSQL (production-style) without forcing a JSON column.
 */

export const SOCIAL_PLATFORMS = [
  'website',
  'instagram',
  'facebook',
  'x',
  'linkedin',
  'youtube',
  'whatsapp',
  'tiktok',
  'pinterest',
  'github',
  'custom',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type SocialLink = {
  platform: SocialPlatform;
  url: string;
  label?: string;
};

export type FaqEntry = {
  q: string;
  a: string;
};

export type ShopContent = {
  announcement: string | null;
  aboutMd: string | null;
  footerNote: string | null;
  social: SocialLink[];
  faq: FaqEntry[];
  showAiAssist: boolean;
};

export const SHOP_CONTENT_LIMITS = {
  announcement: 240,
  about: 4_000,
  footerNote: 280,
  socialEntries: 12,
  socialUrl: 500,
  socialLabel: 60,
  faqEntries: 25,
  faqQuestion: 200,
  faqAnswer: 1_500,
} as const;

export const EMPTY_SHOP_CONTENT: ShopContent = {
  announcement: null,
  aboutMd: null,
  footerNote: null,
  social: [],
  faq: [],
  showAiAssist: true,
};

function trimOrNull(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:' || u.protocol === 'tel:';
  } catch {
    return false;
  }
}

function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

export function normalizeSocialLinks(input: unknown): SocialLink[] {
  const items = parseJsonArray(input);
  const out: SocialLink[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const platform = isSocialPlatform(r.platform) ? r.platform : 'custom';
    const url = typeof r.url === 'string' ? r.url.trim() : '';
    if (!url || url.length > SHOP_CONTENT_LIMITS.socialUrl) continue;
    if (!isValidUrl(url)) continue;
    const label = typeof r.label === 'string' ? r.label.trim().slice(0, SHOP_CONTENT_LIMITS.socialLabel) : undefined;
    out.push(label ? { platform, url, label } : { platform, url });
    if (out.length >= SHOP_CONTENT_LIMITS.socialEntries) break;
  }
  return out;
}

export function normalizeFaqEntries(input: unknown): FaqEntry[] {
  const items = parseJsonArray(input);
  const out: FaqEntry[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const q = typeof r.q === 'string' ? r.q.trim() : '';
    const a = typeof r.a === 'string' ? r.a.trim() : '';
    if (!q || !a) continue;
    out.push({
      q: q.slice(0, SHOP_CONTENT_LIMITS.faqQuestion),
      a: a.slice(0, SHOP_CONTENT_LIMITS.faqAnswer),
    });
    if (out.length >= SHOP_CONTENT_LIMITS.faqEntries) break;
  }
  return out;
}

/**
 * Build a typed `ShopContent` from raw `BusinessProfile` columns.
 * Always returns a populated record (with empty defaults on null).
 */
export function readShopContent(profile: {
  shopAnnouncement?: string | null;
  shopAboutMd?: string | null;
  shopFooterNote?: string | null;
  shopSocialJson?: string | null;
  shopFaqJson?: string | null;
  shopShowAiAssist?: boolean | null;
}): ShopContent {
  return {
    announcement: trimOrNull(profile.shopAnnouncement, SHOP_CONTENT_LIMITS.announcement),
    aboutMd: trimOrNull(profile.shopAboutMd, SHOP_CONTENT_LIMITS.about),
    footerNote: trimOrNull(profile.shopFooterNote, SHOP_CONTENT_LIMITS.footerNote),
    social: normalizeSocialLinks(profile.shopSocialJson),
    faq: normalizeFaqEntries(profile.shopFaqJson),
    showAiAssist: profile.shopShowAiAssist === undefined || profile.shopShowAiAssist === null
      ? EMPTY_SHOP_CONTENT.showAiAssist
      : Boolean(profile.shopShowAiAssist),
  };
}

/**
 * Reduce an arbitrary JSON-y patch object to the columns that are safe to
 * write on `BusinessProfile`. Unknown fields are ignored. Returns the patch
 * shape ready to spread into a Prisma `update` payload.
 */
export function buildShopContentUpdate(input: unknown): {
  shopAnnouncement?: string | null;
  shopAboutMd?: string | null;
  shopFooterNote?: string | null;
  shopSocialJson?: string | null;
  shopFaqJson?: string | null;
  shopShowAiAssist?: boolean;
} {
  if (!input || typeof input !== 'object') return {};
  const patch = input as Record<string, unknown>;
  const out: ReturnType<typeof buildShopContentUpdate> = {};

  if ('announcement' in patch) {
    out.shopAnnouncement = trimOrNull(patch.announcement, SHOP_CONTENT_LIMITS.announcement);
  }
  if ('aboutMd' in patch) {
    out.shopAboutMd = trimOrNull(patch.aboutMd, SHOP_CONTENT_LIMITS.about);
  }
  if ('footerNote' in patch) {
    out.shopFooterNote = trimOrNull(patch.footerNote, SHOP_CONTENT_LIMITS.footerNote);
  }
  if ('social' in patch) {
    const normalized = normalizeSocialLinks(patch.social);
    out.shopSocialJson = normalized.length === 0 ? null : JSON.stringify(normalized);
  }
  if ('faq' in patch) {
    const normalized = normalizeFaqEntries(patch.faq);
    out.shopFaqJson = normalized.length === 0 ? null : JSON.stringify(normalized);
  }
  if ('showAiAssist' in patch) {
    if (typeof patch.showAiAssist === 'boolean') {
      out.shopShowAiAssist = patch.showAiAssist;
    } else if (typeof patch.showAiAssist === 'string') {
      const normalized = patch.showAiAssist.trim().toLowerCase();
      if (normalized === 'true') out.shopShowAiAssist = true;
      if (normalized === 'false') out.shopShowAiAssist = false;
    }
  }

  return out;
}
