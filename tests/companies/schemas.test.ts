import { describe, expect, it } from 'vitest';
import { gstinChecksumChar } from '@/lib/gst/gstin';
import { companyCreateSchema, companyPatchSchema, memberPatchSchema } from '@/lib/companies/schemas';

const VALID = `27ABCDE1234F1Z${gstinChecksumChar('27ABCDE1234F1Z')}`;
const INVALID = `27ABCDE1234F1Z${gstinChecksumChar('27ABCDE1234F1Z') === '0' ? '1' : '0'}`;

describe('companyCreateSchema', () => {
  it('defaults to India and rupees and normalises codes', () => {
    expect(companyCreateSchema.parse({ name: ' Acme Pune ' })).toMatchObject({ name: 'Acme Pune', countryCode: 'IN', baseCurrency: 'INR', users: [] });
    expect(companyCreateSchema.parse({ name: 'Acme US', countryCode: 'us', baseCurrency: 'usd' })).toMatchObject({ countryCode: 'US', baseCurrency: 'USD' });
  });
  it('rejects bad codes, GSTIN and PAN', () => {
    expect(companyCreateSchema.safeParse({ name: 'A', baseCurrency: 'RUPEES' }).success).toBe(false);
    expect(companyCreateSchema.safeParse({ name: 'A', gstin: INVALID }).success).toBe(false);
    expect(companyCreateSchema.safeParse({ name: 'A', gstin: VALID }).success).toBe(true);
    expect(companyCreateSchema.safeParse({ name: 'A', panNumber: 'bad' }).success).toBe(false);
    expect(companyCreateSchema.safeParse({ name: 'A', countryCode: 'US', gstin: VALID }).success).toBe(false);
  });
});

describe('companyPatchSchema', () => {
  it('accepts a partial update and never carries plan or subscription fields', () => {
    const r = companyPatchSchema.parse({ name: 'New name', planTier: 'PRO', subscriptionStatus: 'PRO' } as never);
    expect(r).toEqual({ name: 'New name' });
  });
});

describe('memberPatchSchema', () => {
  it('only allows known roles and access modes', () => {
    expect(memberPatchSchema.safeParse({ groupRole: 'GROUP_ADMIN', accessMode: 'ALL_COMPANIES' }).success).toBe(true);
    expect(memberPatchSchema.safeParse({ groupRole: 'SUPERUSER' }).success).toBe(false);
  });
});
