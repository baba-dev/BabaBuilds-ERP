import { z } from "zod";

export const ENTITY_TYPES = ["PROPRIETOR", "PARTNERSHIP", "LLP", "COMPANY", "OTHER"] as const;

export const setupSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  taxRegime: z.enum(["NEW", "OLD"]).nullable().optional(),
  presumptive: z.enum(["NONE", "SEC_44ADA", "SEC_44AD"]).optional(),
  taxAuditApplicable: z.boolean().optional(),
  tan: z
    .string()
    .trim()
    .toUpperCase()
    .nullable()
    .optional()
    .refine((v) => !v || /^[A-Z]{4}\d{5}[A-Z]$/.test(v), "A TAN is 4 letters, 5 digits and 1 letter"),
});

const KIND = /^[A-Z][A-Z0-9_]{1,30}$/;
export const PERIOD_KEY = /^(\d{4}-\d{2}|\d{4}-\d{2}-Q[1-4]|\d{4}-Q[1-4])$/;

export const itemSchema = z.object({
  kind: z.string().regex(KIND),
  periodKey: z.string().regex(PERIOD_KEY),
  fy: z.string().regex(/^\d{4}-\d{2}$/),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "READY", "FILED", "NOT_APPLICABLE"]).optional(),
  ownerUserId: z.string().max(40).nullable().optional(),
  filedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reference: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  dueOverride: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const signoffSchema = z.object({
  kind: z.string().regex(KIND),
  periodKey: z.string().regex(PERIOD_KEY),
  fy: z.string().regex(/^\d{4}-\d{2}$/),
  undo: z.boolean().optional(),
});

export const requestSchema = z.object({
  fy: z.string().regex(/^\d{4}-\d{2}$/),
  kind: z.enum(["DOCUMENT", "QUERY"]),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(4000),
  itemKind: z.string().regex(KIND).nullable().optional(),
  periodKey: z.string().regex(PERIOD_KEY).nullable().optional(),
  linkType: z.enum(["INVOICE", "EXPENSE", "OTHER"]).nullable().optional(),
  linkId: z.string().max(40).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  documentId: z.string().max(40).nullable().optional(),
});

export const requestPatchSchema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });

export const dateOnly = (s: string) => new Date(`${s}T00:00:00.000Z`);
