import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  HIGH_RISK_MAGIC_LINK_REASON,
  isEmailMagicLinkAllowedForRoles,
} from "@/lib/security/access-risk";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = body.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ allowed: false, reason: "Email is required." }, { status: 400 });
    }

    const [user, pendingInvites] = await Promise.all([
      prisma.user.findUnique({
        where: { email },
        select: { id: true },
      }),
      prisma.workspaceInvite.findMany({
        where: {
          email,
          expiresAt: { gt: new Date() },
        },
        select: { role: true },
      }),
    ]);

    const memberships = user?.id
      ? await prisma.workspaceUser.findMany({
          where: { userId: user.id },
          select: { role: true },
        })
      : [];

    const effectiveRoles = [
      ...memberships.map((membership) => membership.role),
      ...pendingInvites.map((invite) => invite.role),
    ];
    const allowed = isEmailMagicLinkAllowedForRoles(effectiveRoles);

    if (!allowed) {
      return NextResponse.json({
        allowed: false,
        reason: HIGH_RISK_MAGIC_LINK_REASON,
        code: "HIGH_RISK_MAGIC_LINK_BLOCKED",
      });
    }

    return NextResponse.json({ allowed: true });
  } catch (error) {
    console.error("[magic-link-policy] check failed", error);
    return NextResponse.json({ allowed: false, reason: "Unable to verify login policy right now." }, { status: 500 });
  }
}
