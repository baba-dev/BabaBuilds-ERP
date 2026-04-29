/**
 * Unit tests for the shop content sanitiser used by /api/shop/content (PATCH)
 * and the public /api/shop/[slug] response shape.
 */
import { describe, it, expect } from 'vitest';
import {
  buildShopContentUpdate,
  readShopContent,
  EMPTY_SHOP_CONTENT,
  SHOP_CONTENT_LIMITS,
} from '@/lib/shop/content';

describe('shop content helpers', () => {
  it('returns empty defaults for null / missing record', () => {
    expect(readShopContent({})).toEqual(EMPTY_SHOP_CONTENT);
  });

  it('parses JSON-as-text for social and FAQ', () => {
    const c = readShopContent({
      shopAnnouncement: 'Hello',
      shopAboutMd: '## Hi',
      shopSocialJson: JSON.stringify([
        { platform: 'instagram', url: 'https://instagram.com/foo' },
        { platform: 'unknown', url: 'https://example.com' },
      ]),
      shopFaqJson: JSON.stringify([{ q: 'Q?', a: 'A.' }]),
      shopShowAiAssist: false,
    });

    expect(c.announcement).toBe('Hello');
    expect(c.aboutMd).toBe('## Hi');
    expect(c.social).toHaveLength(2);
    expect(c.social[1].platform).toBe('custom');
    expect(c.faq).toEqual([{ q: 'Q?', a: 'A.' }]);
    expect(c.showAiAssist).toBe(false);
  });

  it('caps announcement / about / footer to their max lengths', () => {
    const longA = 'a'.repeat(SHOP_CONTENT_LIMITS.announcement + 50);
    const longAbout = 'b'.repeat(SHOP_CONTENT_LIMITS.about + 50);
    const longFooter = 'c'.repeat(SHOP_CONTENT_LIMITS.footerNote + 50);

    const update = buildShopContentUpdate({
      announcement: longA,
      aboutMd: longAbout,
      footerNote: longFooter,
    });

    expect(update.shopAnnouncement?.length).toBe(SHOP_CONTENT_LIMITS.announcement);
    expect(update.shopAboutMd?.length).toBe(SHOP_CONTENT_LIMITS.about);
    expect(update.shopFooterNote?.length).toBe(SHOP_CONTENT_LIMITS.footerNote);
  });

  it('drops social entries with invalid URL/scheme and caps total entries', () => {
    const links = Array.from({ length: SHOP_CONTENT_LIMITS.socialEntries + 5 }).map(
      (_, i) => ({ platform: 'instagram', url: `https://insta.com/u${i}` }),
    );
    links.push({ platform: 'instagram', url: 'javascript:alert(1)' });
    links.push({ platform: 'instagram', url: 'not-a-url' });

    const update = buildShopContentUpdate({ social: links });
    const parsed = JSON.parse(update.shopSocialJson as string);
    expect(parsed).toHaveLength(SHOP_CONTENT_LIMITS.socialEntries);
    expect(parsed.every((s: { url: string }) => s.url.startsWith('https://'))).toBe(true);
  });

  it('drops FAQ entries missing q or a, caps to max', () => {
    const entries = [
      { q: '', a: 'no question' },
      { q: 'no answer', a: '' },
      ...Array.from({ length: SHOP_CONTENT_LIMITS.faqEntries + 5 }).map((_, i) => ({
        q: `q${i}`,
        a: `a${i}`,
      })),
    ];

    const update = buildShopContentUpdate({ faq: entries });
    const parsed = JSON.parse(update.shopFaqJson as string);
    expect(parsed).toHaveLength(SHOP_CONTENT_LIMITS.faqEntries);
    expect(parsed.every((f: { q: string; a: string }) => f.q && f.a)).toBe(true);
  });

  it('sets json fields to null when arrays are empty (not "[]")', () => {
    const update = buildShopContentUpdate({ social: [], faq: [] });
    expect(update.shopSocialJson).toBeNull();
    expect(update.shopFaqJson).toBeNull();
  });

  it('parses showAiAssist strictly and ignores unknown fields', () => {
    const update = buildShopContentUpdate({
      showAiAssist: 'truthy',
      randomField: 'ignored',
    });
    expect(update.shopShowAiAssist).toBeUndefined();
    expect((update as Record<string, unknown>).randomField).toBeUndefined();
  });

  it('parses string booleans for showAiAssist', () => {
    expect(buildShopContentUpdate({ showAiAssist: 'false' }).shopShowAiAssist).toBe(false);
    expect(buildShopContentUpdate({ showAiAssist: 'true' }).shopShowAiAssist).toBe(true);
  });

  it('returns empty patch for unknown / non-object input', () => {
    expect(buildShopContentUpdate(null)).toEqual({});
    expect(buildShopContentUpdate(undefined)).toEqual({});
    expect(buildShopContentUpdate('string')).toEqual({});
    expect(buildShopContentUpdate(42)).toEqual({});
  });
});
