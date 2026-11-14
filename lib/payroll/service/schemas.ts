import { z } from 'zod';

const money = z.number().finite().min(0).max(100_000_000);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const componentSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,24}$/, 'Use letters, numbers and underscores'),
  label: z.string().trim().min(1).max(60),
  monthly: money,
  taxable: z.boolean().default(true),
  prorate: z.boolean().default(true),
  pfWage: z.boolean().default(false),
});

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}/).transform((v) => new Date(`${v.slice(0, 10)}T00:00:00.000Z`));

export const compensationSchema = z.object({
  effectiveFrom: dateString,
  annualCtc: money,
  components: z.array(componentSchema).min(1).max(30).refine((c) => new Set(c.map((x) => x.code)).size === c.length, 'Each component code must be unique'),
  taxRegime: z.enum(['new', 'old']).default('new'),
  oldRegimeDeductions: money.default(0),
  pfEnabled: z.boolean().default(true),
  pfOnActualBasic: z.boolean().default(false),
  esiEnabled: z.boolean().default(false),
  ptState: z.string().trim().toUpperCase().length(2).optional().nullable().transform((v) => v ?? null),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN looks like ABCDE1234F').optional().or(z.literal('')).transform((v) => v || null),
  uan: z.string().trim().regex(/^\d{12}$/, 'UAN has 12 digits').optional().or(z.literal('')).transform((v) => v || null),
  esiNumber: z.string().trim().regex(/^\d{10,17}$/, 'ESI number has 10 to 17 digits').optional().or(z.literal('')).transform((v) => v || null),
  accountHolder: optionalText(80),
  bankName: optionalText(80),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC looks like HDFC0001234').optional().or(z.literal('')).transform((v) => v || null),
  accountNumber: z.string().transform((v) => v.replace(/\s+/g, '')).refine((v) => v === '' || /^\d{6,18}$/.test(v), 'Account number has 6 to 18 digits').transform((v) => v || null).optional().nullable(),
  paymentMode: z.enum(['BANK_TRANSFER', 'CASH', 'CHEQUE', 'UPI']).default('BANK_TRANSFER'),
  note: optionalText(300),
});

export const employeeCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).default(''),
  email: z.string().trim().email().max(120).optional().or(z.literal('')).transform((v) => v || null),
  phone: optionalText(30),
  employeeCode: optionalText(30),
  joinDate: dateString.optional().nullable(),
  exitDate: dateString.optional().nullable(),
  departmentId: z.string().max(40).optional().nullable(),
  designationId: z.string().max(40).optional().nullable(),
  location: optionalText(80),
  compensation: compensationSchema.optional(),
});

export const employeeUpdateSchema = employeeCreateSchema.omit({ compensation: true }).partial().extend({ status: z.enum(['ACTIVE', 'ON_LEAVE', 'INACTIVE']).optional() });

export const periodSchema = z.object({ year: z.number().int().min(2020).max(2100), month: z.number().int().min(1).max(12) });

export const generateSchema = periodSchema.extend({ notes: optionalText(500) });

export const adjustmentSchema = periodSchema.extend({
  employeeId: z.string().min(1).max(40),
  kind: z.enum(['EARNING', 'BONUS', 'ARREARS', 'REIMBURSEMENT', 'DEDUCTION', 'LOP_DAYS']),
  label: z.string().trim().min(1).max(60),
  amount: z.number().finite().positive().max(100_000_000),
  taxable: z.boolean().default(true),
  note: optionalText(200),
});

export const loanSchema = z.object({
  employeeId: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(60).default('Salary advance'),
  principal: z.number().finite().positive().max(100_000_000),
  emi: z.number().finite().positive().max(100_000_000),
  startYear: z.number().int().min(2020).max(2100),
  startMonth: z.number().int().min(1).max(12),
  note: optionalText(200),
});

export const ctcPreviewSchema = z.object({
  annualCtc: money.min(1),
  basicPercentOfCtc: z.number().min(10).max(90).default(40),
  hraPercentOfBasic: z.number().min(0).max(100).default(50),
  pfEnabled: z.boolean().default(true),
  pfOnActualBasic: z.boolean().default(false),
  esiEnabled: z.boolean().default(false),
  ptState: z.string().trim().toUpperCase().length(2).optional().nullable(),
  taxRegime: z.enum(['new', 'old']).default('new'),
  oldRegimeDeductions: money.default(0),
  hasPan: z.boolean().default(true),
  /** When given, these components are used as they are instead of being built from the CTC. */
  components: z.array(componentSchema).min(1).max(30).optional(),
});

export const payBody = z.object({ reference: optionalText(80), paidOn: dateString.optional(), lineIds: z.array(z.string().max(40)).max(2000).optional() });

export const transitionSchema = z.object({ action: z.enum(['submit_review', 'approve', 'return_draft', 'return_review']), note: optionalText(300) });
