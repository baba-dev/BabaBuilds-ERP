import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  department: { findFirst: vi.fn() }, designation: { findFirst: vi.fn() },
  employee: { findFirst: vi.fn(), findUnique: vi.fn() }, workspaceUser: { findFirst: vi.fn() },
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/workforce/leave-service', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/workforce/leave-service')>()), ensureBalances: vi.fn(), cancelLeave: vi.fn() }));

import { createEmployeeWithCode, validateEmployeeLinks } from '@/lib/workforce/employee-service';

beforeEach(() => { vi.clearAllMocks(); db.department.findFirst.mockResolvedValue({ id: 'd' }); db.designation.findFirst.mockResolvedValue({ id: 'g' }); });

describe('validateEmployeeLinks', () => {
  it('accepts links inside the workspace', async () => {
    db.employee.findFirst.mockResolvedValue({ id: 'm' });
    db.employee.findUnique.mockResolvedValue({ managerId: null });
    await expect(validateEmployeeLinks('w', { departmentId: 'd', designationId: 'g', managerId: 'm' }, 'e')).resolves.toBeUndefined();
  });
  it('rejects a department from another workspace', async () => {
    db.department.findFirst.mockResolvedValue(null);
    await expect(validateEmployeeLinks('w', { departmentId: 'x' })).rejects.toThrow(/department/);
  });
  it('rejects self-management and reporting loops', async () => {
    await expect(validateEmployeeLinks('w', { managerId: 'e' }, 'e')).rejects.toThrow(/own manager/);
    db.employee.findFirst.mockResolvedValue({ id: 'm' });
    db.employee.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ managerId: where.id === 'm' ? 'e' : null }));
    await expect(validateEmployeeLinks('w', { managerId: 'm' }, 'e')).rejects.toThrow(/loop/);
  });
  it('rejects a user already linked elsewhere and a duplicate active email', async () => {
    db.workspaceUser.findFirst.mockResolvedValue({ id: 'wu' });
    db.employee.findFirst.mockResolvedValueOnce({ id: 'other' });
    await expect(validateEmployeeLinks('w', { userId: 'u' })).rejects.toThrow(/already linked/);
    db.employee.findFirst.mockResolvedValueOnce({ id: 'dup' });
    await expect(validateEmployeeLinks('w', { email: 'a@b.co' })).rejects.toThrow(/email/);
  });
});

describe('createEmployeeWithCode', () => {
  it('retries with a fresh code when the code collides', async () => {
    const make = vi.fn().mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValueOnce('ok');
    const next = vi.fn().mockResolvedValueOnce('EMP-000001').mockResolvedValueOnce('EMP-000002');
    await expect(createEmployeeWithCode(make, next)).resolves.toBe('ok');
    expect(make).toHaveBeenLastCalledWith('EMP-000002');
  });
  it('does not retry other errors', async () => {
    await expect(createEmployeeWithCode(vi.fn().mockRejectedValue(new Error('boom')), vi.fn().mockResolvedValue('x'))).rejects.toThrow('boom');
  });
});
