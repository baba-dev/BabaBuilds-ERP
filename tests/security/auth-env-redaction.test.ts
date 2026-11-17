import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateAuthEnvOrThrow } from '@/lib/auth-observability';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function setupAuthEnv() {
  vi.stubEnv('NEXT_PHASE', 'runtime');
  vi.stubEnv('NEXTAUTH_SECRET', 'test-secret');
  vi.stubEnv('AUTH_GOOGLE_ENABLED', 'false');
  vi.stubEnv('AUTH_EMAIL_ENABLED', 'false');
}

describe('authentication configuration diagnostics', () => {
  it('does not echo an invalid credential-bearing URL', () => {
    setupAuthEnv();
    vi.stubEnv('NEXTAUTH_URL', 'https://secret-user:private-token@erp.example.com/');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => validateAuthEnvOrThrow()).toThrow(/credential-free HTTP\(S\)/);
    const output = log.mock.calls.flat().join(' ');
    expect(output).not.toContain('private-token');
    expect(output).not.toContain('secret-user');
  });

  it('keeps HTTP reverse proxy origins working when otherwise valid', () => {
    setupAuthEnv();
    vi.stubEnv('NEXTAUTH_URL', 'http://127.0.0.1:3000');
    expect(() => validateAuthEnvOrThrow()).not.toThrow();
  });

  it('redacts malformed sender addresses', () => {
    setupAuthEnv();
    vi.stubEnv('NEXTAUTH_URL', 'https://erp.example.com/');
    vi.stubEnv('AUTH_EMAIL_ENABLED', 'true');
    vi.stubEnv('EMAIL_SERVER_HOST', 'smtp.example.com');
    vi.stubEnv('EMAIL_SERVER_PORT', '587');
    vi.stubEnv('EMAIL_SERVER_USER', 'tester');
    vi.stubEnv('EMAIL_SERVER_PASSWORD', 'test-password');
    vi.stubEnv('EMAIL_FROM', 'private-contact-not-an-email');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => validateAuthEnvOrThrow()).toThrow(/EMAIL_FROM/);
    expect(log.mock.calls.flat().join(' ')).not.toContain('private-contact-not-an-email');
  });
});
