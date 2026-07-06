import { afterEach, describe, expect, it } from 'vitest';

import { enableMultiCompany } from '@/lib/company-groups/enable-multi-company';
import { prisma } from '@/lib/prisma';

const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];

async function createWorkspace(data: Partial<Parameters<typeof prisma.workspace.create>[0]['data']> = {}) {
  const workspace = await prisma.workspace.create({
    data: {
      name: `Multi-company test ${crypto.randomUUID()}`,
      ...data,
    },
  });
  createdWorkspaceIds.push(workspace.id);
  return workspace;
}

async function createUser() {
  const user = await prisma.user.create({
    data: { email: `multi-company-${crypto.randomUUID()}@example.com` },
  });
  createdUserIds.push(user.id);
  return user;
}

afterEach(async () => {
  await prisma.companyGroup.deleteMany({
    where: { workspaces: { some: { workspaceId: { in: createdWorkspaceIds } } } },
  });
  await prisma.client.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.invoice.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdWorkspaceIds.length = 0;
  createdUserIds.length = 0;
});

describe('enableMultiCompany', () => {
  it('promotes the existing workspace into the primary group workspace', async () => {
    const workspace = await createWorkspace();
    const actor = await createUser();

    const result = await enableMultiCompany({ workspaceId: workspace.id, actorUserId: actor.id });

    const groupWorkspace = await prisma.companyGroupWorkspace.findUnique({
      where: {
        companyGroupId_workspaceId: {
          companyGroupId: result.companyGroupId,
          workspaceId: workspace.id,
        },
      },
    });

    expect(groupWorkspace).toMatchObject({
      workspaceId: workspace.id,
      companyGroupId: result.companyGroupId,
      isPrimary: true,
      isActive: true,
    });
  });

  it('copies subscription fields from Workspace to CompanyGroup', async () => {
    const subscriptionEndsAt = new Date('2026-08-01T00:00:00.000Z');
    const workspace = await createWorkspace({
      subscriptionStatus: 'TRIALING',
      subscriptionEndsAt,
      planTier: 'TEAM',
    });
    const actor = await createUser();

    const result = await enableMultiCompany({ workspaceId: workspace.id, actorUserId: actor.id });

    const group = await prisma.companyGroup.findUniqueOrThrow({ where: { id: result.companyGroupId } });
    expect(group.subscriptionStatus).toBe('TRIALING');
    expect(group.subscriptionEndsAt?.toISOString()).toBe(subscriptionEndsAt.toISOString());
    expect(group.planTier).toBe('TEAM');
    expect(group.billingWorkspaceId).toBe(workspace.id);
  });

  it('makes the actor a GROUP_OWNER', async () => {
    const workspace = await createWorkspace();
    const actor = await createUser();

    const result = await enableMultiCompany({ workspaceId: workspace.id, actorUserId: actor.id });

    const member = await prisma.companyGroupMember.findUnique({
      where: {
        companyGroupId_userId: {
          companyGroupId: result.companyGroupId,
          userId: actor.id,
        },
      },
      include: { workspaceAccess: true },
    });

    expect(member).toMatchObject({ role: 'GROUP_OWNER', isActive: true });
    expect(member?.workspaceAccess).toEqual([
      expect.objectContaining({ workspaceId: workspace.id, accessRole: 'GROUP_OWNER', isActive: true }),
    ]);
  });

  it('enables MULTI_COMPANY at group level', async () => {
    const workspace = await createWorkspace();
    const actor = await createUser();

    const result = await enableMultiCompany({ workspaceId: workspace.id, actorUserId: actor.id });

    const module = await prisma.companyGroupModule.findUnique({
      where: {
        companyGroupId_moduleKey: {
          companyGroupId: result.companyGroupId,
          moduleKey: 'MULTI_COMPANY',
        },
      },
    });

    expect(module).toMatchObject({ moduleKey: 'MULTI_COMPANY', isEnabled: true });
  });

  it('leaves existing workspace business data scoped only by workspaceId', async () => {
    const workspace = await createWorkspace();
    const otherWorkspace = await createWorkspace();
    const actor = await createUser();
    const client = await prisma.client.create({
      data: {
        workspaceId: workspace.id,
        name: `Scoped Client ${crypto.randomUUID()}`,
        address: '123 Test St',
        country: 'IN',
      },
    });
    await prisma.client.create({
      data: {
        workspaceId: otherWorkspace.id,
        name: `Other Client ${crypto.randomUUID()}`,
        address: '456 Test St',
        country: 'IN',
      },
    });

    await enableMultiCompany({ workspaceId: workspace.id, actorUserId: actor.id });

    const workspaceClients = await prisma.client.findMany({ where: { workspaceId: workspace.id } });
    const otherWorkspaceClients = await prisma.client.findMany({ where: { workspaceId: otherWorkspace.id } });
    const retainedClient = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });

    expect(workspaceClients).toHaveLength(1);
    expect(otherWorkspaceClients).toHaveLength(1);
    expect(retainedClient.workspaceId).toBe(workspace.id);
    expect(Object.prototype.hasOwnProperty.call(retainedClient, 'companyGroupId')).toBe(false);
  });

  it('throws a safe error when the workspace does not exist', async () => {
    const actor = await createUser();

    await expect(
      enableMultiCompany({ workspaceId: 'missing-workspace-id', actorUserId: actor.id }),
    ).rejects.toThrow('Workspace not found.');
  });
});
