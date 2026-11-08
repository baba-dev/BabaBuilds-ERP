import { NextResponse } from "next/server";
import { z } from "zod";
import { auditGst, gstError, requireGstAccess } from "@/lib/gst/access";
import { prisma } from "@/lib/prisma";
import { periodRange } from "@/lib/gst/calendar";
import { extensionSchema, markFiled, markFiledSchema, reopenReturn, setExtension } from "@/lib/gst/filing";

/** Record a return as filed on the portal (with its ARN). */
export async function POST(request: Request) {
  const auth = await requireGstAccess("tax.file");
  if (!auth.ok) return auth.response;
  const body = markFiledSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", "Check the filing details and try again.");
  const result = await markFiled(auth.access.workspaceId, auth.access.userId, body.data);
  if (!result.ok) return gstError(result.status, result.code, result.message);
  await auditGst(auth.access, "RETURN_FILED", { type: "GstReturn", id: `${body.data.returnType}:${body.data.periodKey}` }, { arn: body.data.arn ?? null, nil: body.data.isNil ?? false }, request);
  return NextResponse.json({ ok: true });
}

/** Record a notified due-date extension. */
export async function PATCH(request: Request) {
  const auth = await requireGstAccess("tax.manage");
  if (!auth.ok) return auth.response;
  const body = extensionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", "Check the extension date and try again.");
  const result = await setExtension(auth.access.workspaceId, body.data);
  if (!result.ok) return gstError(result.status, result.code, result.message);
  await auditGst(auth.access, "DUE_DATE_EXTENDED", { type: "GstReturn", id: `${body.data.returnType}:${body.data.periodKey}` }, { to: body.data.extendedDueDate }, request);
  return NextResponse.json({ ok: true });
}

const reopenSchema = z.object({ returnType: z.string().min(2).max(10), periodKey: z.string().min(4).max(10) });

/** Mark a filed return as not filed again (e.g. recorded by mistake). */
export async function DELETE(request: Request) {
  const auth = await requireGstAccess("tax.file");
  if (!auth.ok) return auth.response;
  const body = reopenSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", "Missing return details.");
  const result = await reopenReturn(auth.access.workspaceId, body.data.returnType, body.data.periodKey);
  if (!result.ok) return gstError(result.status, result.code, result.message);
  await auditGst(auth.access, "RETURN_REOPENED", { type: "GstReturn", id: `${body.data.returnType}:${body.data.periodKey}` }, undefined, request);
  return NextResponse.json({ ok: true });
}

const reviewSchema = z.object({ returnType: z.string().min(2).max(10), periodKey: z.string().min(4).max(10), action: z.enum(["REQUEST_REVIEW", "APPROVE", "RETURN_TO_DRAFT"]) });

/**
 * Review workflow: the preparer asks for review (tax.manage), a different permission (tax.approve) signs off, and
 * filing needs tax.file. Each step is audited.
 */
export async function PUT(request: Request) {
  const body = reviewSchema.safeParse(await request.clone().json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", "Missing return details.");
  const auth = await requireGstAccess(body.data.action === "APPROVE" ? "tax.approve" : "tax.manage");
  if (!auth.ok) return auth.response;
  if (!periodRange(body.data.periodKey)) return gstError(400, "INVALID_PERIOD", "Unknown return period.");
  const { workspaceId } = auth.access;
  const key = { workspaceId_returnType_periodKey: { workspaceId, returnType: body.data.returnType, periodKey: body.data.periodKey } };
  const existing = await prisma.gstReturn.findUnique({ where: key });
  if (existing?.status === "FILED") return gstError(409, "ALREADY_FILED", "This return is already filed.");
  const status = body.data.action === "REQUEST_REVIEW" ? "READY_FOR_REVIEW" : body.data.action === "APPROVE" ? "APPROVED" : "OPEN";
  if (body.data.action === "APPROVE" && existing?.status !== "READY_FOR_REVIEW") return gstError(409, "NOT_IN_REVIEW", "Ask for review before approving.");
  await prisma.gstReturn.upsert({ where: key, create: { workspaceId, returnType: body.data.returnType, periodKey: body.data.periodKey, status }, update: { status } });
  await auditGst(auth.access, `REVIEW_${body.data.action}`, { type: "GstReturn", id: `${body.data.returnType}:${body.data.periodKey}` }, undefined, request);
  return NextResponse.json({ ok: true, status });
}
