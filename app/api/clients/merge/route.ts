import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClientAccess, clientError } from "@/lib/clients/access";
import { serviceError } from "@/lib/clients/http";
import { mergeClients } from "@/lib/clients/service";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";

/** Moves everything from one client into another and removes the duplicate. Billing history is kept. */
export async function POST(request: Request) {
  const limit = await enforceRouteRateLimit({ request, route: "/api/clients/merge", scope: "client-merge", max: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const auth = await requireClientAccess("clients.manage");
  if (!auth.ok) return auth.response;
  const parsed = z.object({ sourceId: z.string().min(1), targetId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return clientError(400, "INVALID_BODY", "Choose the client to merge and the one to keep.");
  const res = await mergeClients(auth.ctx, parsed.data.sourceId, parsed.data.targetId);
  return res.ok ? NextResponse.json({ success: true, moved: res.moved }) : serviceError(res);
}
