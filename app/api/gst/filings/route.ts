import { NextResponse } from "next/server";
import { z } from "zod";
import { gstError, requireGstAccess } from "@/lib/gst/access";
import { extensionSchema, markFiled, markFiledSchema, reopenReturn, setExtension } from "@/lib/gst/filing";

/** Record a return as filed on the portal (with its ARN). */
export async function POST(request: Request) {
  const auth = await requireGstAccess("tax.file");
  if (!auth.ok) return auth.response;
  const body = markFiledSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", "Check the filing details and try again.");
  const result = await markFiled(auth.access.workspaceId, auth.access.userId, body.data);
  if (!result.ok) return gstError(result.status, result.code, result.message);
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
  return NextResponse.json({ ok: true });
}
