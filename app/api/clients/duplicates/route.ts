import { NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/clients/access";
import { findDuplicateGroups } from "@/lib/clients/queries";

export async function GET() {
  const auth = await requireClientAccess("clients.view");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ groups: await findDuplicateGroups(auth.ctx.workspaceId) }, { headers: { "Cache-Control": "no-store" } });
}
