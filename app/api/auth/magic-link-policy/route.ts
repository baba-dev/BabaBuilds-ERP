import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeAuthThrottle } from "@/lib/auth/ip-throttle";
import { getClientIp } from "@/lib/request-ip";
import {
  HIGH_RISK_MAGIC_LINK_REASON,
  isEmailMagicLinkAllowedForRoles,
} from "@/lib/security/access-risk";

export async function POST(req: Request) {
  // Unauthenticated and role-revealing: throttle per client IP to make enumeration impractical.
  const throttle = consumeAuthThrottle(`magic-link-policy:${getClientIp(req)}`, 20, 60_000);
  if (!throttle.ok) {
    return NextResponse.json(
      { allowed: false, reason: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } },
    );
  }

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
        select: { role: true, businessRole: true },
      }),
    ]);

    const memberships = user?.id
      ? await prisma.workspaceUser.findMany({
          where: { userId: user.id },
          select: { role: true, businessRole: true },
        })
      : [];

    const effectiveRoles = [
      ...memberships.flatMap((membership) => [membership.businessRole, membership.role]),
      ...pendingInvites.flatMap((invite) => [invite.businessRole, invite.role]),
    ];
    const allowed = isEmailMagicLinkAllowedForRoles(effectiveRoles, email);

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
