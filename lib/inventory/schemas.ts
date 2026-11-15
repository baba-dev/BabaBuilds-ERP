import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const money = z.number().finite().min(0).max(1_000_000_000);
const count = z.number().int().min(0).max(100_000_000);

export const productFieldsSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required').max(60).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, 'Name is required').max(160),
  description: text(2000),
  category: text(80),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  baselinePrice: money.default(0),
  costPrice: money.default(0),
  safetyStock: count.default(5),
  reorderQuantity: count.optional().nullable().transform((v) => (v && v > 0 ? v : null)),
  leadTimeDays: z.number().int().min(0).max(365).optional().nullable().transform((v) => v ?? null),
  preferredVendorId: z.string().max(40).optional().nullable().transform((v) => v || null),
  barcode: text(60),
  location: text(80),
});

export const adjustSchema = z.object({
  productId: z.string().min(1).max(40),
  /** ADD / REMOVE take a quantity; COUNT sets the stock to what was counted. */
  mode: z.enum(['ADD', 'REMOVE', 'COUNT']).default('ADD'),
  quantity: z.number().int().min(0).max(100_000_000),
  reason: z.string().trim().max(200).optional().nullable().transform((v) => v || null),
});

export const bulkCountSchema = z.object({
  counts: z.array(z.object({ productId: z.string().min(1).max(40), counted: z.number().int().min(0).max(100_000_000) })).min(1).max(500),
  reason: z.string().trim().max(200).optional().nullable().transform((v) => v || 'Stock count'),
});

export const poLineSchema = z.object({
  productId: z.string().min(1).max(40),
  quantity: z.number().int().min(1).max(10_000_000),
  unitPrice: money,
  gstRate: z.number().min(0).max(100).optional().nullable().transform((v) => v ?? null),
  hsnCode: z.string().trim().max(10).optional().nullable().transform((v) => v || null),
});

export const poCreateSchema = z.object({
  vendorId: z.string().max(40).optional().nullable().transform((v) => v || null),
  supplier: z.string().trim().min(1, 'Choose or enter a supplier').max(120),
  supplierGstin: text(20),
  supplierStateCode: text(2),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().nullable().transform((v) => (v ? new Date(`${v.slice(0, 10)}T00:00:00.000Z`) : null)),
  paymentTermsDays: z.number().int().min(0).max(365).optional().nullable().transform((v) => v ?? null),
  notes: text(500),
  lines: z.array(poLineSchema).min(1, 'Add at least one item').max(200),
  /** Send straight away instead of keeping it as a draft. */
  send: z.boolean().optional(),
});

export const poUpdateSchema = z.object({
  action: z.enum(['send', 'cancel', 'reopen']).optional(),
  notes: text(500),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().nullable().transform((v) => (v ? new Date(`${v.slice(0, 10)}T00:00:00.000Z`) : null)),
});

export const receiveSchema = z.object({
  /** Which lines arrived and how many. Omitted: everything still outstanding. */
  lines: z.array(z.object({ itemId: z.string().min(1).max(40), quantity: z.number().int().min(1).max(10_000_000) })).max(200).optional(),
  syncExpense: z.boolean().optional(),
  supplierGstin: z.string().trim().max(20).nullish(),
  supplierInvoiceNo: z.string().trim().max(60).nullish(),
  supplierStateCode: z.string().trim().max(2).nullish(),
});

export const movementQuerySchema = z.object({
  productId: z.string().max(40).optional(),
  type: z.enum(['IN', 'OUT', 'ADJ']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(40).optional(),
});
