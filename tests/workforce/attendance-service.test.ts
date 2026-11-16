import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  attendanceRecord: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  employee: { findFirst: vi.fn() },
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/workforce/leave-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workforce/leave-service')>()),
  loadCalendar: vi.fn(async () => ({ workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'], holidays: new Set<string>(), timeZone: 'Asia/Kolkata', workStart: '09:30', workEnd: '18:30' })),
}));

import { managerSet, selfCheckIn, selfCheckOut } from '@/lib/workforce/attendance-service';

// Tue 17 Nov 2026, 10:00 IST = 04:30 UTC (on time); 10:30 IST = 05:00 UTC (late)
const onTime = new Date('2026-11-17T04:00:00Z'); // 09:30 IST
const late = new Date('2026-11-17T05:30:00Z'); // 11:00 IST
const sunday = new Date('2026-11-22T05:00:00Z');

beforeEach(() => { vi.clearAllMocks(); db.attendanceRecord.upsert.mockImplementation(async (a: { create: object }) => ({ id: 'r1', ...a.create })); });

describe('selfCheckIn', () => {
  it('files PRESENT under the workplace day when on time', async () => {
    db.attendanceRecord.findUnique.mockResolvedValue(null);
    const r = await selfCheckIn({ workspaceId: 'w', employeeId: 'e', now: onTime });
    expect(r).toMatchObject({ status: 'PRESENT', date: new Date('2026-11-17T00:00:00Z') });
  });
  it('marks LATE after the grace period and REMOTE when remote', async () => {
    db.attendanceRecord.findUnique.mockResolvedValue(null);
    expect((await selfCheckIn({ workspaceId: 'w', employeeId: 'e', now: late })).status).toBe('LATE');
    expect((await selfCheckIn({ workspaceId: 'w', employeeId: 'e', now: late, remote: true })).status).toBe('REMOTE');
  });
  it('refuses a second check-in, a manager-entered day, and a weekly off', async () => {
    db.attendanceRecord.findUnique.mockResolvedValue({ checkInAt: onTime });
    await expect(selfCheckIn({ workspaceId: 'w', employeeId: 'e', now: late })).rejects.toThrow(/already checked in/);
    db.attendanceRecord.findUnique.mockResolvedValue({ checkInAt: null, isManagerEntered: true });
    await expect(selfCheckIn({ workspaceId: 'w', employeeId: 'e', now: late })).rejects.toThrow(/manager/);
    db.attendanceRecord.findUnique.mockResolvedValue(null);
    await expect(selfCheckIn({ workspaceId: 'w', employeeId: 'e', now: sunday })).rejects.toThrow(/weekly off/);
  });
});

describe('selfCheckOut', () => {
  it('needs a check-in first and only once', async () => {
    db.attendanceRecord.findUnique.mockResolvedValue(null);
    await expect(selfCheckOut({ workspaceId: 'w', employeeId: 'e', now: late })).rejects.toThrow(/Check in first/);
    db.attendanceRecord.findUnique.mockResolvedValue({ id: 'r', checkInAt: onTime, checkOutAt: late });
    await expect(selfCheckOut({ workspaceId: 'w', employeeId: 'e', now: late })).rejects.toThrow(/already checked out/);
    db.attendanceRecord.findUnique.mockResolvedValue({ id: 'r', checkInAt: onTime, checkOutAt: null });
    db.attendanceRecord.update.mockResolvedValue({ id: 'r' });
    await selfCheckOut({ workspaceId: 'w', employeeId: 'e', now: late });
    expect(db.attendanceRecord.update).toHaveBeenCalledWith({ where: { id: 'r' }, data: { checkOutAt: late } });
  });
});

describe('managerSet', () => {
  const base = { workspaceId: 'w', managerUserId: 'm', employeeId: 'e', status: 'PRESENT' as const, now: late };
  it('rejects future days, unknown employees and reversed times', async () => {
    db.employee.findFirst.mockResolvedValue({ id: 'e' });
    await expect(managerSet({ ...base, date: '2026-11-18' })).rejects.toThrow(/future/);
    db.employee.findFirst.mockResolvedValue(null);
    await expect(managerSet({ ...base, date: '2026-11-16' })).rejects.toThrow(/not found/);
    db.employee.findFirst.mockResolvedValue({ id: 'e' });
    await expect(managerSet({ ...base, date: '2026-11-16', checkInAt: '2026-11-16T10:00:00Z', checkOutAt: '2026-11-16T09:00:00Z' })).rejects.toThrow(/before check-in/);
  });
  it('upserts a past day flagged as manager-entered', async () => {
    db.employee.findFirst.mockResolvedValue({ id: 'e' });
    const r = await managerSet({ ...base, date: '2026-11-16', status: 'ABSENT' });
    expect(r).toMatchObject({ status: 'ABSENT', isManagerEntered: true, managedByUserId: 'm' });
  });
});
