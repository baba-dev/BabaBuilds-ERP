import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIAB_WRITE_ENDPOINTS, MiabApiError, miabReadVersion, miabWrite } from '@/lib/email-billing/miab/writes';
import { miabApiUrl } from '@/lib/email-billing/miab/guard';
import { extractDirectAliases, extractDirectUsers, normalizeMailbox, parseQuotaMb } from '@/lib/email-billing/miab/normalize';
import { fetchMailBillingInventory } from '@/lib/email-billing/miab-client';
import { generateMailboxPassword } from '@/lib/email-billing/ops/password';

const TOKEN = 'admin@box.example.com:s3cret-admin-pass';
const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());
const reply = (text: string, status = 200) => new Response(text, { status });

describe('write endpoint allow-list', () => {
  it('only exposes mailbox and alias writes: no DNS, TLS, restart, update, backup, admin-privilege or domain endpoints', () => {
    expect(Object.values(MIAB_WRITE_ENDPOINTS).sort()).toEqual([
      '/mail/aliases/add', '/mail/aliases/remove', '/mail/users/add', '/mail/users/password', '/mail/users/quota', '/mail/users/remove',
    ]);
    expect(Object.values(MIAB_WRITE_ENDPOINTS).join(' ')).not.toMatch(/dns|ssl|restart|update|backup|privileges|domain|system/i);
  });
});

describe('miabApiUrl', () => {
  it('puts the API under /admin and keeps an existing base path', () => {
    expect(miabApiUrl(new URL('https://box.example.com'), '/mail/users/add').toString()).toBe('https://box.example.com/admin/mail/users/add');
    expect(miabApiUrl(new URL('https://box.example.com/admin'), '/mail/users?format=json').toString()).toBe('https://box.example.com/admin/mail/users?format=json');
    expect(miabApiUrl(new URL('https://box.example.com/api/v1/?x=1'), 'mail/domains').toString()).toBe('https://box.example.com/api/v1/mail/domains');
  });
});

describe('miabWrite', () => {
  it('POSTs a form with Basic auth to the endpoint under /admin and does not follow redirects', async () => {
    fetchMock.mockResolvedValue(reply('mail user added'));
    const out = await miabWrite({ baseUrl: 'https://box.example.com', token: TOKEN, endpoint: 'userAdd', form: { email: 'a@x.com', password: 'pw-123456' }, secretFields: ['password'] });
    expect(out).toBe('mail user added');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://box.example.com/admin/mail/users/add');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(TOKEN).toString('base64')}`);
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(init.body).toBe('email=a%40x.com&password=pw-123456');
  });

  it('turns a non-2xx answer into a short error that never contains the password or the credential', async () => {
    fetchMock.mockResolvedValue(reply('Bad password pw-123456 for s3cret-admin-pass\nplease retry', 400));
    const err = await miabWrite({ baseUrl: 'https://box.example.com', token: TOKEN, endpoint: 'userAdd', form: { email: 'a@x.com', password: 'pw-123456' }, secretFields: ['password'] }).catch((e) => e);
    expect(err).toBeInstanceOf(MiabApiError);
    expect(err.status).toBe(400);
    expect(err.message).not.toContain('pw-123456');
    expect(err.message).not.toContain('s3cret-admin-pass');
    expect(err.message).not.toMatch(/\n/);
  });

  it('truncates long server messages and maps network failures to 502 and timeouts to 504', async () => {
    fetchMock.mockResolvedValueOnce(reply('x'.repeat(5000), 500));
    expect((await miabWrite({ baseUrl: 'https://box.example.com', token: TOKEN, endpoint: 'userRemove', form: { email: 'a@x.com' } }).catch((e) => e)).message.length).toBeLessThanOrEqual(300);
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    expect((await miabWrite({ baseUrl: 'https://box.example.com', token: TOKEN, endpoint: 'userRemove', form: { email: 'a@x.com' } }).catch((e) => e)).status).toBe(502);
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    expect((await miabWrite({ baseUrl: 'https://box.example.com', token: TOKEN, endpoint: 'userRemove', form: { email: 'a@x.com' } }).catch((e) => e)).status).toBe(504);
  });

  it('refuses to run without an "email:password" credential and never calls the network', async () => {
    await expect(miabWrite({ baseUrl: 'https://box.example.com', token: undefined, endpoint: 'userRemove', form: {} })).rejects.toThrow(/admin-email/);
    await expect(miabWrite({ baseUrl: 'https://box.example.com', token: 'no-colon', endpoint: 'userRemove', form: {} })).rejects.toThrow(/admin-email/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the box version', async () => {
    fetchMock.mockResolvedValue(reply('v70\n'));
    expect(await miabReadVersion({ baseUrl: 'https://box.example.com', token: TOKEN })).toBe('v70');
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://box.example.com/admin/system/version');
    fetchMock.mockResolvedValue(reply('no', 401));
    await expect(miabReadVersion({ baseUrl: 'https://box.example.com', token: TOKEN })).rejects.toThrow('401');
  });
});

describe('Mail-in-a-Box response shapes', () => {
  it('parses quotas', () => {
    expect(parseQuotaMb('0')).toBe(0);
    expect(parseQuotaMb('500M')).toBe(500);
    expect(parseQuotaMb('5G')).toBe(5120);
    expect(parseQuotaMb('1T')).toBe(1024 * 1024);
    expect(parseQuotaMb(250)).toBe(250);
    expect(parseQuotaMb(null)).toBeNull();
    expect(parseQuotaMb('lots')).toBeNull();
  });

  it('reads admin privileges and archived status from Mail-in-a-Box user records', () => {
    expect(normalizeMailbox({ email: 'Boss@X.com', privileges: ['admin'], status: 'active', quota: '2G' })).toMatchObject({ email: 'boss@x.com', isAdmin: true, status: 'ACTIVE', quotaMb: 2048 });
    expect(normalizeMailbox({ email: 'old@x.com', privileges: [], status: 'inactive' })).toMatchObject({ isAdmin: false, status: 'ARCHIVED' });
  });

  it('flattens domain-grouped users and aliases and still accepts flat lists', () => {
    const grouped = [{ domain: 'x.com', users: [{ email: 'a@x.com' }, { email: 'b@x.com' }] }, { domain: 'y.com', users: [{ email: 'c@y.com' }] }];
    expect(extractDirectUsers(grouped)).toHaveLength(3);
    expect(extractDirectUsers([{ email: 'a@x.com' }])).toHaveLength(1);
    expect(extractDirectAliases([{ domain: 'x.com', aliases: [{ address: 'info@x.com' }] }, { domain: 'y.com', alias: [{ address: 'hi@y.com' }] }])).toHaveLength(2);
  });

  it('builds an inventory from the real API shapes: text domain list, grouped users, grouped aliases', async () => {
    fetchMock.mockImplementation(async (url: URL) => {
      const u = String(url);
      if (u.endsWith('/admin/mail/domains')) return reply('x.com\ny.com\n');
      if (u.includes('/admin/mail/users')) return reply(JSON.stringify([{ domain: 'x.com', users: [{ email: 'a@x.com', privileges: [], status: 'active', quota: '1G' }, { email: 'root@x.com', privileges: ['admin'], status: 'active' }] }, { domain: 'y.com', users: [] }]));
      if (u.includes('/admin/mail/aliases')) return reply(JSON.stringify([{ domain: 'x.com', aliases: [{ address: 'info@x.com' }] }]));
      return reply('', 404);
    });
    const inv = await fetchMailBillingInventory({ baseUrl: 'https://box.example.com', accessMode: 'MANAGED_API', token: TOKEN });
    expect(inv.domains.map((d) => [d.domain, d.mailboxes.length, d.aliasesCount])).toEqual([['x.com', 2, 1], ['y.com', 0, 0]]);
    expect(inv.domains[0].mailboxes.find((m) => m.email === 'root@x.com')?.isAdmin).toBe(true);
  });
});

describe('generateMailboxPassword', () => {
  it('is long, unique, free of whitespace and look-alike characters, and mixes character classes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const pw = generateMailboxPassword();
      expect(pw.length).toBe(20);
      expect(pw).not.toMatch(/\s|[01OlI]/);
      expect(pw).toMatch(/[a-zA-Z]/);
      expect(pw).toMatch(/\d/);
      expect(pw).toMatch(/[-_.@#%]/);
      seen.add(pw);
    }
    expect(seen.size).toBe(200);
    expect(generateMailboxPassword(32).length).toBe(32);
  });
});
