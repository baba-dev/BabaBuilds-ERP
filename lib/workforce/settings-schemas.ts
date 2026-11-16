import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 09:30.');
const isZone = (z0: string) => { try { new Intl.DateTimeFormat('en', { timeZone: z0 }); return true; } catch { return false; } };

export const scheduleSchema = z.object({
  workingDays: z.array(z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'])).min(1, 'Pick at least one working day.').max(7).optional(),
  workStartTime: hhmm.optional(),
  workEndTime: hhmm.optional(),
  timeZone: z.string().max(60).refine(isZone, 'That time zone is not recognised.').optional(),
}).refine((s) => !s.workStartTime || !s.workEndTime || s.workStartTime < s.workEndTime, { message: 'Work must end after it starts.', path: ['workEndTime'] });

export const holidaySchema = z.object({
  name: z.string().trim().min(1, 'Give the holiday a name.').max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Pick a date.').transform((v) => v.slice(0, 10)),
  isRecurring: z.boolean().default(true),
});

export const leaveTypeCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(60),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,12}$/, 'Code: letters, numbers or _ (max 12).'),
  description: z.string().trim().max(200).optional().nullable(),
  color: z.string().trim().max(20).default('indigo'),
  defaultDays: z.coerce.number().min(0).max(366).default(0),
  isPaid: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export const leaveTypePatchSchema = leaveTypeCreateSchema.omit({ code: true }).partial();
