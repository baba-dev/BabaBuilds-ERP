import { NextResponse } from "next/server";
import { attachmentsFromJson, createDraftsFromInbound, MAX_ATTACHMENTS, workspaceForInboxToken, type InboundAttachment } from "@/lib/expenses/inbox";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";

/**
 * Inbound mail webhook for the expense inbox (Postmark, Mailgun, SendGrid or any forwarder that can POST JSON or a form).
 * The secret token in the URL identifies the workspace; wrong or switched-off tokens get the same 404.
 */
export async function POST(request: Request, props: { params: Promise<{ token: string }> }) {
  const limit = enforceRouteRateLimit({ request, route: "/api/expenses/inbound", scope: "expense-inbox", max: 60, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const { token } = await props.params;
  const workspaceId = await workspaceForInboxToken(token);
  if (!workspaceId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let from = ""; let subject = ""; let attachments: InboundAttachment[] = [];
  try {
    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      const parsed = attachmentsFromJson((await request.json()) as Record<string, unknown>);
      ({ from, subject, attachments } = parsed);
    } else {
      const form = await request.formData();
      from = String(form.get("from") ?? form.get("From") ?? "").slice(0, 200);
      subject = String(form.get("subject") ?? form.get("Subject") ?? "").slice(0, 200);
      for (const [, v] of form.entries()) {
        if (v instanceof File && v.size > 0 && attachments.length < MAX_ATTACHMENTS) attachments.push({ name: v.name, contentType: v.type, buffer: Buffer.from(await v.arrayBuffer()) });
      }
    }
  } catch {
    return NextResponse.json({ error: "Could not read the message." }, { status: 400 });
  }
  if (attachments.length === 0) return NextResponse.json({ ok: true, created: 0, note: "No attachments" });
  const result = await createDraftsFromInbound(workspaceId, { from, subject, attachments });
  return NextResponse.json({ ok: true, created: result.created.length, skipped: result.skipped });
}
