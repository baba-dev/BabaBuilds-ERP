import { prisma } from '@/lib/prisma';

type ProfileWithInheritance = {
  workspaceId?: string | null;
  inheritSmtpFromGroup?: boolean | null;
  inheritPaymentGatewayFromGroup?: boolean | null;
};

type ResolverKind = 'smtp' | 'paymentGateway';

async function findBillingWorkspaceProfile<TProfile extends ProfileWithInheritance>(
  workspaceId: string,
): Promise<TProfile | null> {
  const groupLink = await prisma.companyGroupWorkspace.findFirst({
    where: { workspaceId, isActive: true },
    select: { companyGroup: { select: { billingWorkspaceId: true } } },
  });

  const billingWorkspaceId = groupLink?.companyGroup.billingWorkspaceId;
  if (!billingWorkspaceId || billingWorkspaceId === workspaceId) return null;

  return prisma.businessProfile.findUnique({
    where: { workspaceId: billingWorkspaceId },
  }) as Promise<TProfile | null>;
}

export async function resolveBusinessProfileSettings<TProfile extends ProfileWithInheritance>(
  profile: TProfile | null,
  kind: ResolverKind,
): Promise<TProfile | null> {
  if (!profile) return null;

  const shouldInherit =
    kind === 'smtp'
      ? Boolean(profile.inheritSmtpFromGroup)
      : Boolean(profile.inheritPaymentGatewayFromGroup);

  if (!shouldInherit || !profile.workspaceId) return profile;

  const billingProfile = await findBillingWorkspaceProfile<TProfile>(profile.workspaceId);
  return billingProfile ?? profile;
}

export async function resolveBusinessProfileSettingsForWorkspace<TProfile extends ProfileWithInheritance>(
  workspaceId: string,
  kind: ResolverKind,
): Promise<TProfile | null> {
  const profile = (await prisma.businessProfile.findUnique({ where: { workspaceId } })) as TProfile | null;
  return resolveBusinessProfileSettings(profile, kind);
}
