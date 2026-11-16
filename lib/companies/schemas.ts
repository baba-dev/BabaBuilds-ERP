import { z } from 'zod';

import { isValidGstin, normalizeGstin } from '@/lib/gst/gstin';

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).optional().nullable().transform((v) => v || null);
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code like INR.');
const country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use a 2-letter country code like IN.');
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const gstin = optText(20).refine((v) => !v || isValidGstin(v), 'That GSTIN is not valid.').transform((v) => (v ? normalizeGstin(v) : null));
const pan = optText(20).refine((v) => !v || PAN.test(v.toUpperCase()), 'A PAN looks like ABCDE1234F.').transform((v) => (v ? v.toUpperCase() : null));

export const BUSINESS_ROLES = ['OWNER', 'ADMIN', 'FINANCE_MANAGER', 'ACCOUNTANT', 'SALES_MANAGER', 'OPERATIONS_MANAGER', 'INVENTORY_MANAGER', 'STAFF', 'VIEWER'] as const;
export const GROUP_ROLES = ['GROUP_OWNER', 'GROUP_ADMIN', 'GROUP_FINANCE', 'MEMBER'] as const;
export const ACCESS_MODES = ['ALL_COMPANIES', 'SPECIFIC_COMPANIES'] as const;

const teamUser = z.object({ userId: z.string().min(1).max(40), businessRole: z.enum(BUSINESS_ROLES).default('STAFF') });

export const companyFields = {
  name: text(120).min(1, 'Give the company a name.'),
  countryCode: country,
  baseCurrency: currency,
  email: z.string().trim().email('Enter a valid email.').max(120),
  phone: optText(30),
  website: optText(200),
  address: text(400).min(3, 'Add the registered address.'),
  proprietorName: text(120).min(1),
  gstin,
  panNumber: pan,
  udyamNumber: optText(30),
  bankName: optText(120), accountName: optText(120), accountNumber: optText(40), ifscCode: optText(20),
};

export const companyCreateSchema = z.object({
  name: companyFields.name,
  countryCode: companyFields.countryCode.default('IN'),
  baseCurrency: companyFields.baseCurrency.default('INR'),
  email: companyFields.email.optional(),
  phone: companyFields.phone, website: companyFields.website,
  address: companyFields.address.optional(), proprietorName: companyFields.proprietorName.optional(),
  gstin: companyFields.gstin, panNumber: companyFields.panNumber, udyamNumber: companyFields.udyamNumber,
  relationType: z.enum(['MEMBER', 'SUBSIDIARY', 'BRANCH', 'AFFILIATE']).default('MEMBER'),
  users: z.array(teamUser).max(100).default([]),
}).refine((c) => !c.gstin || c.countryCode === 'IN', { message: 'A GSTIN only applies to companies in India.', path: ['gstin'] });

export const companyPatchSchema = z.object({
  name: companyFields.name, countryCode: companyFields.countryCode, baseCurrency: companyFields.baseCurrency,
  email: companyFields.email, phone: companyFields.phone, website: companyFields.website, address: companyFields.address,
  proprietorName: companyFields.proprietorName, gstin: companyFields.gstin, panNumber: companyFields.panNumber, udyamNumber: companyFields.udyamNumber,
  bankName: companyFields.bankName, accountName: companyFields.accountName, accountNumber: companyFields.accountNumber, ifscCode: companyFields.ifscCode,
  relationType: z.enum(['MEMBER', 'SUBSIDIARY', 'BRANCH', 'AFFILIATE']),
  users: z.array(teamUser).max(100),
  billingWorkspaceId: z.string().max(40).nullable(),
}).partial();

export const groupPatchSchema = z.object({ name: text(120).min(1, 'Give the group a name.') });

export const memberPatchSchema = z.object({
  groupRole: z.enum(GROUP_ROLES).optional(),
  accessMode: z.enum(ACCESS_MODES).optional(),
  access: z.array(z.object({ workspaceId: z.string().min(1).max(40), accessRole: z.enum(BUSINESS_ROLES) })).max(100).optional(),
});

export const memberAddSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter the person\'s email.'),
  groupRole: z.enum(GROUP_ROLES).default('MEMBER'),
  accessMode: z.enum(ACCESS_MODES).default('SPECIFIC_COMPANIES'),
  access: z.array(z.object({ workspaceId: z.string().min(1).max(40), accessRole: z.enum(BUSINESS_ROLES) })).max(100).default([]),
});
