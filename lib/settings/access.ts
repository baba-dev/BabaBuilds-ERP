import "server-only";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withPermission } from "@/lib/rbac";

export type SettingsActor = { workspaceId: string; userId: string; email: string | null };

/** Session plus a fresh workspace.manage_settings check. Every settings write goes through here. */
export async function requireSettingsManager(): Promise<{ ok: true; actor: SettingsActor } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId;
  const userId = session?.user?.id as string | undefined;
  if (!session || !workspaceId || !userId) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const perm = await withPermission(userId, workspaceId, "workspace.manage_settings");
  if (!perm.granted) return { ok: false, response: perm.response };
  return { ok: true, actor: { workspaceId, userId, email: session.user?.email ?? null } };
}
