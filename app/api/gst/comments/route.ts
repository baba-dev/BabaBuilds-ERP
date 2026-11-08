import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditGst, gstError, requireGstAccess } from "@/lib/gst/access";
import { periodRange } from "@/lib/gst/calendar";

const TYPES = ["GSTR1", "IFF", "GSTR3B", "PMT06", "CMP08", "GSTR4", "GSTR9", "GSTR9C"] as const;

export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const q = new URL(request.url).searchParams;
  const returnType = q.get("returnType") ?? "";
  const periodKey = q.get("period") ?? "";
  if (!(TYPES as readonly string[]).includes(returnType) || !periodRange(periodKey)) return gstError(400, "INVALID_QUERY", "Choose a return and period.");
  const rows = await prisma.gstReturnComment.findMany({ where: { workspaceId: auth.access.workspaceId, returnType, periodKey }, orderBy: { createdAt: "asc" }, take: 200 });
  return NextResponse.json({ comments: rows.map((c) => ({ id: c.id, author: c.authorName ?? "—", mine: c.authorUserId === auth.access.userId, body: c.body, createdAt: c.createdAt.toISOString() })) });
}

const schema = z.object({ returnType: z.enum(TYPES), periodKey: z.string().min(4).max(10), body: z.string().trim().min(1).max(1000) });

/** Anyone who can view tax can comment, so an accountant with read-only access can leave review notes. */
export async function POST(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success || !periodRange(body.data.periodKey)) return gstError(400, "INVALID_BODY", "Write a comment up to 1,000 characters.");
  const session = await getServerSession(authOptions);
  const row = await prisma.gstReturnComment.create({
    data: { workspaceId: auth.access.workspaceId, returnType: body.data.returnType, periodKey: body.data.periodKey, authorUserId: auth.access.userId, authorName: session?.user?.name ?? session?.user?.email ?? null, body: body.data.body },
  });
  await auditGst(auth.access, "COMMENT_ADDED", { type: "GstReturn", id: `${body.data.returnType}:${body.data.periodKey}` }, undefined, request);
  return NextResponse.json({ id: row.id }, { status: 201 });
}
