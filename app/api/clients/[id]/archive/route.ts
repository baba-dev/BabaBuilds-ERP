import { NextResponse } from "next/server";
import { z } from "zod";
import { clientError, requireClientAccess } from "@/lib/clients/access";
import { serviceError } from "@/lib/clients/http";
import { setArchived } from "@/lib/clients/service";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAccess("clients.manage");
  if (!auth.ok) return auth.response;
  const body = z.object({ archived: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return clientError(400, "INVALID_BODY", "Say whether to archive or restore.");
  const { id } = await props.params;
  const res = await setArchived(auth.ctx, id, body.data.archived);
  return res.ok ? NextResponse.json({ success: true, archived: body.data.archived }) : serviceError(res);
}
