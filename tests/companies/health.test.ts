import { describe, expect, it } from 'vitest';
import { setupHealth } from '@/lib/companies/health';

const full = { address: '12 MG Road, Pune', email: 'accounts@acme.in', panNumber: 'ABCDE1234F', gstin: '27ABCDE1234F1Z5', accountNumber: '1234567890', ifscCode: 'HDFC0001234' };

describe('setupHealth', () => {
  it('scores a complete Indian company at 100', () => {
    expect(setupHealth({ countryCode: 'IN', isSetupComplete: true, profile: full })).toEqual({ score: 100, issues: [] });
  });
  it('flags the placeholders the old create route wrote', () => {
    const h = setupHealth({ countryCode: 'IN', isSetupComplete: false, profile: { address: 'Not provided', email: 'hello@example.com', panNumber: 'NOTPROVIDED', gstin: null, accountNumber: 'Not provided', ifscCode: 'Not provided' } });
    expect(h.issues).toEqual(['ADDRESS', 'EMAIL', 'PAN', 'GSTIN', 'BANK', 'SETUP']);
    expect(h.score).toBe(0);
  });
  it('does not ask a non-Indian company for a GSTIN', () => {
    const h = setupHealth({ countryCode: 'US', isSetupComplete: true, profile: { ...full, gstin: null } });
    expect(h.issues).toEqual([]);
    expect(h.score).toBe(100);
  });
  it('handles a company with no profile at all', () => {
    expect(setupHealth({ countryCode: 'US', isSetupComplete: false, profile: null }).issues).toEqual(['ADDRESS', 'EMAIL', 'PAN', 'BANK', 'SETUP']);
  });
});
