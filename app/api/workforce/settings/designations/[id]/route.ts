/**
 * app/api/workforce/settings/designations/[id]/route.ts
 * DELETE — delete a designation (only if no employees attached)
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RbacDeniedError, rbacDeniedResponse, requirePermission } from "@/lib/rbac";
import { ModuleDisabledError, requireModule } from "@/lib/modules";
import { resolveSessionMembership } from '@/lib/workspace-scope';

// The workspace the user is in (session), not an arbitrary membership.
async function getWid(session: Parameters<typeof resolveSessionMembership>[0]) {
  return (await resolveSessionMembership(session))?.workspaceId ?? null;
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const wid = await getWid(session);
    if (!wid) return NextResponse.json({ error: "No workspace" }, { status: 400 });

    try {
      await requireModule(wid, "WORKFORCE");
      await requirePermission(session.user.id, wid, "workforce.settings.manage");
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: "Module disabled" }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const { id } = await params;

    const attached = await prisma.employee.count({ where: { workspaceId: wid, designationId: id } });
    if (attached > 0) {
      return NextResponse.json({ error: "Cannot delete a designation with employees assigned" }, { status: 409 });
    }

    await prisma.designation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[designations/DELETE]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

