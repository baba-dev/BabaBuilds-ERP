import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use a date like 2026-11-16.').transform((v) => v.slice(0, 10));
const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

export const leaveSubmitSchema = z.object({
  employeeId: z.string().max(40).optional().nullable(),
  leaveTypeId: z.string().min(1).max(40),
  startDate: dateOnly,
  endDate: dateOnly,
  halfDay: z.enum(['NONE', 'FIRST', 'SECOND']).default('NONE'),
  reason: optText(500),
});

export const leaveDecisionSchema = z.object({ action: z.enum(['APPROVE', 'REJECT']), rejectionReason: optText(300) });

export const leavePreviewSchema = z.object({ start: dateOnly, end: dateOnly, halfDay: z.enum(['NONE', 'FIRST', 'SECOND']).default('NONE'), leaveTypeId: z.string().max(40).optional(), employeeId: z.string().max(40).optional() });

export const attendanceSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('CHECK_IN'), remote: z.boolean().optional() }),
  z.object({ action: z.literal('CHECK_OUT') }),
  z.object({
    action: z.literal('SET'),
    employeeId: z.string().min(1).max(40),
    date: dateOnly,
    status: z.enum(['PRESENT', 'LATE', 'ABSENT', 'HALF_DAY', 'HOLIDAY', 'REMOTE']),
    checkInAt: z.string().datetime().optional().nullable(),
    checkOutAt: z.string().datetime().optional().nullable(),
    notes: optText(300),
  }),
]);

export const employeeCreateSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(80),
  lastName: z.string().trim().min(1, 'Last name is required.').max(80),
  email: z.string().trim().email('Enter a valid email.').max(120).optional().nullable().or(z.literal('')).transform((v) => v || null),
  phone: z.string().trim().max(24).optional().nullable().transform((v) => v || null),
  departmentId: z.string().max(40).optional().nullable().transform((v) => v || null),
  designationId: z.string().max(40).optional().nullable().transform((v) => v || null),
  managerId: z.string().max(40).optional().nullable().transform((v) => v || null),
  joinDate: dateOnly.optional().nullable().or(z.literal('')).transform((v) => v || null),
  location: z.string().trim().max(80).optional().nullable().transform((v) => v || null),
  userId: z.string().max(40).optional().nullable().transform((v) => v || null),
  notes: z.string().trim().max(1000).optional().nullable().transform((v) => v || null),
  emergencyName: z.string().trim().max(80).optional().nullable().transform((v) => v || null),
  emergencyPhone: z.string().trim().max(24).optional().nullable().transform((v) => v || null),
  emergencyRelation: z.string().trim().max(40).optional().nullable().transform((v) => v || null),
});

export const employeePatchSchema = employeeCreateSchema.partial().extend({
  exitDate: dateOnly.optional().nullable().or(z.literal('')).transform((v) => v || null),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'INACTIVE']).optional(),
});

export const offboardSchema = z.object({ exitDate: dateOnly, reason: optText(300) });
