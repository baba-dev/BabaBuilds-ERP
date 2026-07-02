import { z } from 'zod';

export const mailBillingAccessModeSchema = z.enum(['READ_ONLY_ADAPTER', 'DIRECT_MIAB_API']);
export const mailBillingServerStatusSchema = z.enum(['ACTIVE', 'DISABLED', 'ERROR']);

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

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
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export function parseJsonBody<T>(schema: z.ZodSchema<T>, body: unknown) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(message || 'Invalid request body');
  }
  return parsed.data;
}
