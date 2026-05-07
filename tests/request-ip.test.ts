import { describe, expect, it } from 'vitest';
import { getClientIp, normalizeIp } from '@/lib/request-ip';

describe('request IP helpers', () => {
  it('prefers Cloudflare headers before other proxy headers', () => {
    const headers = new Headers({
      'cf-connecting-ip': '203.0.113.10',
      'true-client-ip': '203.0.113.11',
      'x-real-ip': '203.0.113.12',
      'x-forwarded-for': '203.0.113.13, 203.0.113.14',
    });

    expect(getClientIp(headers)).toBe('203.0.113.10');
  });

  it('falls back through enterprise, real IP, forwarded IP, and unknown', () => {
    expect(getClientIp(new Request('https://example.test', { headers: { 'true-client-ip': '203.0.113.11' } }))).toBe(
      '203.0.113.11',
    );
    expect(getClientIp(new Headers({ 'x-real-ip': '203.0.113.12' }))).toBe('203.0.113.12');
    expect(getClientIp(new Headers({ 'x-forwarded-for': '203.0.113.13, 203.0.113.14' }))).toBe('203.0.113.13');
    expect(getClientIp(new Headers())).toBe('unknown');
  });

  it('normalizes IP literals and strips ports safely', () => {
    expect(normalizeIp(' 203.0.113.10:443 ')).toBe('203.0.113.10');
    expect(normalizeIp('[2001:DB8::1]:443')).toBe('2001:db8::1');
    expect(normalizeIp('2001:DB8::1')).toBe('2001:db8::1');
    expect(normalizeIp('2001:db8::1:443')).toBe('2001:db8::1:443');
  });

  it('rejects empty or malformed values so lower-priority headers can be used', () => {
    const headers = new Headers({
      'cf-connecting-ip': 'not an ip',
      'x-forwarded-for': '198.51.100.5:8443, 10.0.0.1',
    });

    expect(normalizeIp('999.0.0.1')).toBeNull();
    expect(getClientIp(headers)).toBe('198.51.100.5');
  });
});
