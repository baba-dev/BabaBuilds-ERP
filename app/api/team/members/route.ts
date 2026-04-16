/**
 * app/api/team/members/route.ts
 *
 * Returns all workspace members and pending invites.
 * Also returns the current user's role and granted permissions.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGrantedPermissions } from "@/lib/rbac";
import { ROLE_LABELS, legacyRoleToBusinessRole, isValidBusinessRole } from "@/lib/permissions";

export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.workspaceId || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId: string = session.workspaceId;
    const currentUserId: string = session.user.id;

    const membership = await prisma.workspaceUser.findUnique({
      where: { userId_workspaceId: { userId: currentUserId, workspaceId } },
      select: { role: true, businessRole: true, isActive: true },
    });

    if (!membership || !membership.isActive) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentBusinessRole = membership.businessRole ?? legacyRoleToBusinessRole(membership.role);

    // Get all workspace members (active + inactive shown separately)
    const [members, invites, grantedPermissions] = await Promise.all([
      prisma.workspaceUser.findMany({
        where: { workspaceId },
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          role: true,
          businessRole: true,
          isActive: true,
          joinedAt: true,
          lastActiveAt: true,
          userId: true,
          user: {
            select: { name: true, email: true, image: true },
          },
        },
      }),
      prisma.workspaceInvite.findMany({
        where: { workspaceId, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, role: true, businessRole: true, expiresAt: true, createdAt: true },
      }),
      getGrantedPermissions(currentUserId, workspaceId),
    ]);

    // Enrich members with role labels
    const enrichedMembers = members.map((m) => {
      const br = m.businessRole ?? legacyRoleToBusinessRole(m.role);
      return {
        ...m,
        businessRole: br,
        roleLabel: isValidBusinessRole(br) ? ROLE_LABELS[br] : br,
      };
    });

    // Enrich invites with role labels
    const enrichedInvites = invites.map((inv) => {
      const br = inv.businessRole ?? legacyRoleToBusinessRole(inv.role);
      return {
        ...inv,
        businessRole: br,
        roleLabel: isValidBusinessRole(br) ? ROLE_LABELS[br] : br,
      };
    });

    return NextResponse.json({
      data: {
        currentUserRole: membership.role,
        currentBusinessRole,
        currentRoleLabel: isValidBusinessRole(currentBusinessRole) ? ROLE_LABELS[currentBusinessRole] : currentBusinessRole,
        grantedPermissions,
        members: enrichedMembers,
        invites: enrichedInvites,
      },
    });
  } catch (error) {
    console.error("Team members GET error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
