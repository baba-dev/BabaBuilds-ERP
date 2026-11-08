import { NextResponse } from "next/server";
import { z } from "zod";
import { gstError, requireGstAccess } from "@/lib/gst/access";
import { getGspProvider, lookupRegistration } from "@/lib/gst/gsp";

/** Whether registration checks are available at all, so the client form can explain a disabled button. */
export async function GET() {
  const auth = await requireGstAccess("clients.view");
  if (!auth.ok) return auth.response;
  const provider = getGspProvider();
  return NextResponse.json({ configured: !!provider, provider: provider?.name ?? null });
}

const bodySchema = z.object({ gstin: z.string().trim().min(1).max(20) });

export async function POST(request: Request) {
  const auth = await requireGstAccess("clients.view");
  if (!auth.ok) return auth.response;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", "Send the GSTIN to check.");
  const out = await lookupRegistration(body.data.gstin);
  if (out.ok) return NextResponse.json({ registration: out.registration });
  const status = out.code === "GSTIN_INVALID" ? 422 : out.code === "GSP_NOT_CONFIGURED" ? 501 : 502;
  return gstError(status, out.code, out.message);
}
