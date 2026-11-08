import "server-only";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withPermission } from "@/lib/rbac";
import type { Permission } from "@/lib/permissions";

export type GstAccess = { workspaceId: string; userId: string };

export function gstError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status });
}

export async function requireGstAccess(permission: Permission): Promise<{ ok: true; access: GstAccess } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId;
  const userId = session?.user?.id as string | undefined;
  if (!session || !workspaceId || !userId) return { ok: false, response: gstError(401, "AUTH_UNAUTHORIZED", "Unauthorized") };
  const perm = await withPermission(userId, workspaceId, permission);
  if (!perm.granted) return { ok: false, response: perm.response };
  return { ok: true, access: { workspaceId, userId } };
}

/** Neutralises spreadsheet formula injection and quotes the cell. */
export function csvCell(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export const toCsv = (lines: Array<Array<string | number | null | undefined>>) => "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n");

export function download(body: string | Buffer, filename: string, type: string) {
  return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), { headers: { "Content-Type": `${type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}

import { logActivity } from "@/lib/security/activity-log";

/** Audit trail for every GST action that changes data (who, what, which record). Never throws. */
export async function auditGst(access: GstAccess, action: string, entity: { type: string; id?: string | null }, metadata?: Record<string, unknown>, request?: Request) {
  try {
    await logActivity({ action: `GST_${action}`, status: "SUCCESS", workspaceId: access.workspaceId, actor: { userId: access.userId }, entity, metadata, request });
  } catch (error) {
    console.error("GST audit log failed:", error);
  }
}
