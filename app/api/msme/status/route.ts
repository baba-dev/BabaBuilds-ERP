import { NextResponse } from "next/server";
import { requireGstAccess } from "@/lib/gst/access";
import { loadSmallBusiness } from "@/lib/msme/data";

export async function GET() {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  return NextResponse.json(await loadSmallBusiness(auth.access.workspaceId));
}
