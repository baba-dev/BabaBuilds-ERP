import { z } from 'zod';

export const mailBillingAccessModeSchema = z.enum(['READ_ONLY_ADAPTER', 'DIRECT_MIAB_API', 'MANAGED_API']);
export const mailBillingServerStatusSchema = z.enum(['ACTIVE', 'DISABLED', 'ERROR']);
export const mailBillingBillingModeSchema = z.enum(['FIXED', 'PER_MAILBOX', 'BUNDLE_PLUS_EXTRA', 'MANUAL']);
export const mailBillingFrequencySchema = z.enum(['MONTHLY', 'QUARTERLY', 'ANNUALLY']);
export const mailBillingReviewApplyActionSchema = z.enum(['IGNORE_DOMAIN', 'PAUSE_SUBSCRIPTION', 'APPLY_MAILBOX_COUNT']);

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const idSchema = z.string().trim().min(1).max(191);
const currencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code');
const moneySchema = z.coerce.number().finite().nonnegative();
const nonNegativeIntSchema = z.coerce.number().int().nonnegative();
const optionalDateSchema = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Date must be valid');

export const mailBillingServerCreateSchema = z.object({
  name: z.string().trim().min(1).max(120).default('Mail Server'),
  baseUrl: z.string().trim().url().max(2048),
  accessMode: mailBillingAccessModeSchema.default('READ_ONLY_ADAPTER'),
  token: optionalTrimmedString,
  status: mailBillingServerStatusSchema.default('ACTIVE'),
});

export const mailBillingServerPatchSchema = z
  .object({
    name: optionalTrimmedString,
    baseUrl: optionalTrimmedString,
    accessMode: mailBillingAccessModeSchema.optional(),
    token: z.string().optional(),
    clearToken: z.boolean().optional(),
    status: mailBillingServerStatusSchema.optional(),
    /** Turns write operations on or off. Turning on checks the credential against the box first. */
    writesEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const mailBillingPlanCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: optionalTrimmedString.nullish(),
  billingMode: mailBillingBillingModeSchema.default('FIXED'),
  currency: currencySchema.default('INR'),
  basePrice: moneySchema.default(0),
  includedMailboxes: nonNegativeIntSchema.default(0),
  extraMailboxPrice: moneySchema.default(0),
  frequency: mailBillingFrequencySchema.default('MONTHLY'),
  sortOrder: z.coerce.number().int().default(0),
});

export const mailBillingPlanPatchSchema = mailBillingPlanCreateSchema.partial().extend({
  isActive: z.coerce.boolean().optional(),
});

export const mailBillingSubscriptionCreateSchema = z.object({
  domainId: idSchema,
  clientId: idSchema.optional(),
  planId: idSchema.optional(),
  notes: optionalTrimmedString,
  /** Free trial length. Billing starts when it ends; 0 or omitted starts the subscription without a trial. */
  trialDays: z.coerce.number().int().min(0).max(365).optional(),
});

export const mailBillingSubscriptionStatusSchema = z.enum(['ACTIVE', 'REVIEW_REQUIRED', 'PAUSED', 'CANCELLED', 'TRIALING']);
export const mailBillingDomainStatusSchema = z.enum(['ACTIVE', 'REMOVED', 'IGNORED']);

export const mailBillingSubscriptionPatchSchema = z
  .object({
    billingStatus: mailBillingSubscriptionStatusSchema.optional(),
    billableMailboxCount: nonNegativeIntSchema.optional(),
    autoUpdateQuantity: z.boolean().optional(),
    nextReviewAt: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Date must be valid')
      .nullish(),
    notes: z.string().trim().max(5000).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const mailBillingDomainPatchSchema = z
  .object({
    status: mailBillingDomainStatusSchema.optional(),
    billingNotes: z.string().trim().max(5000).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const mailBillingMapClientSchema = z.object({
  clientId: idSchema.nullish(),
  billingNotes: optionalTrimmedString,
  billingMode: z.enum(['DOMAIN_PLAN', 'PER_MAILBOX', 'MANUAL']).optional(),
});

export const mailBillingLinkRetainerSchema = z.object({ retainerId: idSchema });

export const mailBillingCreateRetainerSchema = z.object({
  billingMode: mailBillingBillingModeSchema.optional(),
  currency: currencySchema.default('INR'),
  amount: moneySchema.default(0),
  frequency: mailBillingFrequencySchema.default('MONTHLY'),
  nextBillingDate: optionalDateSchema,
});

export const mailBillingReviewApplySchema = z.object({ action: mailBillingReviewApplyActionSchema });

export const mailBillingSettingsPatchSchema = z.object({
  defaultBillingMode: mailBillingBillingModeSchema.default('FIXED'),
  defaultCurrency: currencySchema.default('INR'),
  defaultPlanId: idSchema.nullish(),
  autoCreateReviewItems: z.coerce.boolean().default(true),
  autoUpdateRetainerQuantities: z.coerce.boolean().default(false),
  syncFrequencyPreference: z.enum(['MANUAL', 'DAILY', 'WEEKLY']).default('MANUAL'),
  alertRecipientsJson: z.unknown().optional(),
  treatRemovedDomainsAsReviewRequired: z.coerce.boolean().default(true),
  ignoreAdminMailboxesFromBilling: z.coerce.boolean().default(false),
  // Optional so a client that does not send them leaves the saved values unchanged.
  usageBillingPolicy: z.enum(['LATEST', 'HIGH_WATER_MARK']).optional(),
  prorateIncreases: z.boolean().optional(),
});

export const mailBillingApplyQuantitySchema = z.object({
  /** Defaults to the pending count awaiting approval. */
  toCount: nonNegativeIntSchema.max(100_000).optional(),
});

export function parseJsonBody<T>(schema: z.ZodSchema<T>, body: unknown) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(message || 'Invalid request body');
  }
  return parsed.data;
}
