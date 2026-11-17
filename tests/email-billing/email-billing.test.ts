import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MODULE_KEYS, DEFAULT_ENABLED_MODULE_KEYS, isValidModuleKey } from '@/lib/module-keys';
import {
  getDirectMiabReadEndpoints,
  isPrivateOrReservedAddress,
  validateMailBillingUrl,
} from '@/lib/email-billing/miab-client';
import { calculateMailBilling } from '@/lib/email-billing/billing-calculator';
import {
  mailBillingPlanCreateSchema,
  mailBillingSettingsPatchSchema,
  mailBillingSubscriptionCreateSchema,
} from '@/lib/email-billing/validation';

describe('Email Billing module registration and guardrails', () => {
  it('validates MIAB_BILLING and keeps it opt-in', () => {
    expect(MODULE_KEYS).toContain('MIAB_BILLING');
    expect(isValidModuleKey('MIAB_BILLING')).toBe(true);
    expect(DEFAULT_ENABLED_MODULE_KEYS.has('MIAB_BILLING')).toBe(false);
  });

  it('direct MiaB connector exposes only read endpoints', () => {
    expect(getDirectMiabReadEndpoints()).toEqual([
      '/mail/domains',
      '/mail/users?format=json',
      '/mail/aliases?format=json',
    ]);
    expect(getDirectMiabReadEndpoints().join(' ')).not.toMatch(
      /create|delete|password|quota|admin|dns|restart|update/i,
    );
  });

  it('blocks unsafe production URLs and reserved network ranges', () => {
    expect(() => validateMailBillingUrl('http://mail.example.com', 'production')).toThrow(/HTTPS/);
    expect(() => validateMailBillingUrl('https://127.0.0.1:1022', 'production')).toThrow(/blocked/);
    expect(() => validateMailBillingUrl('https://192.168.1.10', 'production')).toThrow(/blocked/);
    expect(() => validateMailBillingUrl('https://user:secret@mail.example.com', 'production')).toThrow(
      /Credentials/,
    );
    expect(isPrivateOrReservedAddress('100.64.0.1')).toBe(true);
    expect(isPrivateOrReservedAddress('198.18.0.1')).toBe(true);
    expect(isPrivateOrReservedAddress('::1')).toBe(true);
    for (const address of ['fe80::1', 'fe90::1', 'fea0::1', 'febf::1', 'fd12::1', '::ffff:7f00:1', '2001:db8::1']) {
      expect(isPrivateOrReservedAddress(address)).toBe(true);
    }
    expect(isPrivateOrReservedAddress('2606:4700:4700::1111')).toBe(false);
    expect(() => validateMailBillingUrl('https://localhost./', 'production')).toThrow(/blocked/);
    expect(() => validateMailBillingUrl('https://admin.localhost/', 'production')).toThrow(/blocked/);
    expect(validateMailBillingUrl('https://mail.example.com', 'production').hostname).toBe('mail.example.com');
  });
});

describe('Email Billing calculator', () => {
  it('calculates fixed, per-mailbox, bundle-plus-extra, and manual modes', () => {
    expect(
      calculateMailBilling({
        plan: { billingMode: 'FIXED', currency: 'USD', basePrice: 25 },
        syncedMailboxCount: 10,
        domain: 'example.com',
      }).totalRecurringAmount,
    ).toBe(25);
    expect(
      calculateMailBilling({
        plan: { billingMode: 'PER_MAILBOX', currency: 'USD', basePrice: 4 },
        syncedMailboxCount: 3,
        domain: 'example.com',
      }).totalRecurringAmount,
    ).toBe(12);
    const bundle = calculateMailBilling({
      plan: {
        billingMode: 'BUNDLE_PLUS_EXTRA',
        currency: 'USD',
        basePrice: 20,
        includedMailboxes: 5,
        extraMailboxPrice: 3,
      },
      syncedMailboxCount: 8,
      domain: 'example.com',
    });
    expect(bundle.extraMailboxCount).toBe(3);
    expect(bundle.totalRecurringAmount).toBe(29);
    const manual = calculateMailBilling({
      plan: { billingMode: 'MANUAL', currency: 'USD', basePrice: 0 },
      subscription: null,
      syncedMailboxCount: 2,
    });
    expect(manual.reviewRequired).toBe(true);
  });
});

describe('Email Billing API validation', () => {
  it('rejects invalid price, date, currency, and ID inputs', () => {
    expect(mailBillingPlanCreateSchema.safeParse({ name: 'Bad', currency: 'RUPEES', basePrice: -1 }).success).toBe(false);
    expect(mailBillingSubscriptionCreateSchema.safeParse({ domainId: '' }).success).toBe(false);
    expect(mailBillingSettingsPatchSchema.safeParse({ defaultCurrency: 'USD', syncFrequencyPreference: 'HOURLY' }).success).toBe(false);
  });
});

describe('Email Billing route and assistant safety', () => {
  it('does not expose forbidden operational endpoint names outside tests/docs', () => {
    const roots = ['app/api/email-billing', 'app/(dashboard)/email-billing', 'lib/email-billing'];
    const forbidden =
      /create-mailbox|delete-mailbox|remove-mailbox|change-password|reset-password|mailbox-password|privilege|edit-dns|dns-edit|alias-add|alias-remove|mailbox-admin/i;
    const files = roots.flatMap((root) =>
      fs
        .readdirSync(root, { recursive: true })
        .map((f) => path.join(root, String(f)))
        .filter((f) => fs.statSync(f).isFile()),
    );
    const offenders = files.filter((file) => forbidden.test(file) || forbidden.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('redacts server tokens from API source responses', () => {
    const sources = [
      fs.readFileSync('app/api/email-billing/servers/route.ts', 'utf8'),
      fs.readFileSync('app/api/email-billing/servers/[id]/route.ts', 'utf8'),
    ].join('\n');
    expect(sources).toMatch(/hasToken/);
    expect(sources).not.toMatch(/decryptedToken|token: server\.encryptedToken|encryptedToken: server\.encryptedToken/);
  });

  it('integrates read-only Email Billing context into the AI assistant', () => {
    const chatRoute = fs.readFileSync('app/api/chat/route.ts', 'utf8');
    expect(chatRoute).toContain('get_email_billing_summary');
    expect(chatRoute).toContain('list_email_billing_review_items');
    expect(chatRoute).toContain('open_email_billing_dashboard');
    expect(chatRoute).toContain('/email-billing');
    expect(chatRoute).toContain('Never offer mailbox creation');
  });

  it('wraps billing-impacting actions in transactions', () => {
    const sources = [
      'app/api/email-billing/subscriptions/route.ts',
      'app/api/email-billing/subscriptions/[id]/create-retainer/route.ts',
      'app/api/email-billing/domains/[id]/create-retainer/route.ts',
      'app/api/email-billing/domains/[id]/link-retainer/route.ts',
      'app/api/email-billing/review/[id]/apply/route.ts',
    ].map((file) => fs.readFileSync(file, 'utf8'));
    expect(sources.every((source) => source.includes('prisma.$transaction'))).toBe(true);
  });
});

describe('Email Billing patch schemas', () => {
  it('only accepts known subscription and domain statuses and non-empty patches', async () => {
    const { mailBillingSubscriptionPatchSchema, mailBillingDomainPatchSchema } = await import('@/lib/email-billing/validation');
    expect(mailBillingSubscriptionPatchSchema.safeParse({ billingStatus: 'PAUSED', billableMailboxCount: 3 }).success).toBe(true);
    expect(mailBillingSubscriptionPatchSchema.safeParse({ billingStatus: 'WHATEVER' }).success).toBe(false);
    expect(mailBillingSubscriptionPatchSchema.safeParse({ billableMailboxCount: -1 }).success).toBe(false);
    expect(mailBillingSubscriptionPatchSchema.safeParse({ nextReviewAt: 'not a date' }).success).toBe(false);
    expect(mailBillingSubscriptionPatchSchema.safeParse({}).success).toBe(false);
    expect(mailBillingDomainPatchSchema.safeParse({ status: 'IGNORED' }).success).toBe(true);
    expect(mailBillingDomainPatchSchema.safeParse({ status: 'DELETED' }).success).toBe(false);
    expect(mailBillingDomainPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe('miab-client module split', () => {
  it('keeps the public surface of the original module', async () => {
    const mod = await import('@/lib/email-billing/miab-client');
    for (const name of ['fetchMailBillingInventory', 'getDirectMiabReadEndpoints', 'isPrivateOrReservedAddress', 'validateMailBillingUrl', 'validateMailBillingUrlForFetch']) {
      expect(typeof (mod as Record<string, unknown>)[name]).toBe('function');
    }
  });
});

describe('Email Hosting billing schemas', () => {
  it('validates trial length on subscription create', async () => {
    const { mailBillingSubscriptionCreateSchema } = await import('@/lib/email-billing/validation');
    expect(mailBillingSubscriptionCreateSchema.parse({ domainId: 'd1', trialDays: 14 }).trialDays).toBe(14);
    expect(mailBillingSubscriptionCreateSchema.parse({ domainId: 'd1' }).trialDays).toBeUndefined();
    expect(mailBillingSubscriptionCreateSchema.safeParse({ domainId: 'd1', trialDays: -1 }).success).toBe(false);
    expect(mailBillingSubscriptionCreateSchema.safeParse({ domainId: 'd1', trialDays: 400 }).success).toBe(false);
    expect(mailBillingSubscriptionCreateSchema.safeParse({ domainId: 'd1', trialDays: 1.5 }).success).toBe(false);
  });

  it('leaves usage settings unchanged when a client does not send them, and rejects unknown policies', async () => {
    const { mailBillingSettingsPatchSchema, mailBillingApplyQuantitySchema, mailBillingReviewApplySchema, mailBillingSubscriptionPatchSchema } = await import('@/lib/email-billing/validation');
    const parsed = mailBillingSettingsPatchSchema.parse({});
    expect(parsed.usageBillingPolicy).toBeUndefined();
    expect(parsed.prorateIncreases).toBeUndefined();
    expect(mailBillingSettingsPatchSchema.parse({ usageBillingPolicy: 'HIGH_WATER_MARK', prorateIncreases: false })).toMatchObject({ usageBillingPolicy: 'HIGH_WATER_MARK', prorateIncreases: false });
    expect(mailBillingSettingsPatchSchema.safeParse({ usageBillingPolicy: 'AVERAGE' }).success).toBe(false);
    expect(mailBillingApplyQuantitySchema.safeParse({}).success).toBe(true);
    expect(mailBillingApplyQuantitySchema.safeParse({ toCount: -2 }).success).toBe(false);
    expect(mailBillingReviewApplySchema.safeParse({ action: 'APPLY_MAILBOX_COUNT' }).success).toBe(true);
    expect(mailBillingSubscriptionPatchSchema.safeParse({ billingStatus: 'TRIALING' }).success).toBe(true);
  });
});
