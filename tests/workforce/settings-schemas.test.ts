import { describe, expect, it } from 'vitest';
import { holidaySchema, leaveTypeCreateSchema, scheduleSchema } from '@/lib/workforce/settings-schemas';

describe('scheduleSchema', () => {
  it('accepts a normal week and rejects bad times, zones and empty weeks', () => {
    expect(scheduleSchema.safeParse({ workingDays: ['MON', 'TUE'], workStartTime: '09:30', workEndTime: '18:00', timeZone: 'Asia/Kolkata' }).success).toBe(true);
    expect(scheduleSchema.safeParse({ workStartTime: '9:30' }).success).toBe(false);
    expect(scheduleSchema.safeParse({ workStartTime: '18:00', workEndTime: '09:00' }).success).toBe(false);
    expect(scheduleSchema.safeParse({ timeZone: 'Mars/Olympus' }).success).toBe(false);
    expect(scheduleSchema.safeParse({ workingDays: [] }).success).toBe(false);
    expect(scheduleSchema.safeParse({ workingDays: ['FUNDAY'] }).success).toBe(false);
  });
});

describe('holidaySchema', () => {
  it('trims the date to a day and defaults to recurring', () => {
    expect(holidaySchema.parse({ name: ' Diwali ', date: '2026-11-08T00:00:00.000Z' })).toEqual({ name: 'Diwali', date: '2026-11-08', isRecurring: true });
    expect(holidaySchema.safeParse({ name: '', date: '2026-11-08' }).success).toBe(false);
  });
});

describe('leaveTypeCreateSchema', () => {
  it('upper-cases the code and bounds the days', () => {
    expect(leaveTypeCreateSchema.parse({ name: 'Annual', code: 'al', defaultDays: '12' })).toMatchObject({ code: 'AL', defaultDays: 12, isPaid: true });
    expect(leaveTypeCreateSchema.safeParse({ name: 'X', code: 'bad code' }).success).toBe(false);
    expect(leaveTypeCreateSchema.safeParse({ name: 'X', code: 'X', defaultDays: 400 }).success).toBe(false);
  });
});
