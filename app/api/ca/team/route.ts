import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCaAccess } from "@/lib/ca/access";

/** Who has CA access to this workspace (accountants, pending invitations) and who can own an obligation. */
export async function GET() {
  const auth = await requireCaAccess("ca.view");
  if (!auth.ok) return auth.response;
  const { workspaceId } = auth.access;
  const [members, invites] = await Promise.all([
    prisma.workspaceUser.findMany({ where: { workspaceId, isActive: true }, select: { userId: true, businessRole: true, lastActiveAt: true, joinedAt: true, user: { select: { name: true, email: true } } }, orderBy: { joinedAt: "asc" } }),
    prisma.workspaceInvite.findMany({ where: { workspaceId, businessRole: "ACCOUNTANT", expiresAt: { gt: new Date() } }, select: { id: true, email: true, expiresAt: true, createdAt: true } }),
  ]);
  return NextResponse.json({
    members: members.map((m) => ({ userId: m.userId, name: m.user.name ?? m.user.email ?? "User", email: m.user.email, role: m.businessRole, lastActiveAt: m.lastActiveAt?.toISOString() ?? null })),
    accountants: members.filter((m) => m.businessRole === "ACCOUNTANT").map((m) => ({ userId: m.userId, name: m.user.name ?? m.user.email ?? "User", email: m.user.email, lastActiveAt: m.lastActiveAt?.toISOString() ?? null, joinedAt: m.joinedAt.toISOString() })),
    pendingInvites: invites.map((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt.toISOString(), sentAt: i.createdAt.toISOString() })),
  });
}
