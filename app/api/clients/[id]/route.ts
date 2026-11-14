import { NextResponse } from "next/server";
import { clientError, requireClientAccess } from "@/lib/clients/access";
import { readClientBody, removeStoredLogo, serviceError, storeClientLogo, validationError } from "@/lib/clients/http";
import { getClientOverview } from "@/lib/clients/queries";
import { normalizeClientInput } from "@/lib/clients/schema";
import { deleteClient, updateClient } from "@/lib/clients/service";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

/** One client. `?overview=1` returns the full 360 view: contacts, notes, billing, payment behaviour, invoices, proposals, retainers, timeline. */
export async function GET(request: Request, props: Ctx) {
  const auth = await requireClientAccess("clients.view");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  try {
    if (new URL(request.url).searchParams.get("overview") === "1") {
      const overview = await getClientOverview(auth.ctx.workspaceId, id);
      return overview ? NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } }) : clientError(404, "CLIENT_NOT_FOUND", "Client not found");
    }
    const client = await prisma.client.findFirst({ where: { id, workspaceId: auth.ctx.workspaceId } });
    return client ? NextResponse.json({ data: client }) : clientError(404, "CLIENT_NOT_FOUND", "Client not found");
  } catch (error) {
    console.error("Client fetch error:", error);
    return clientError(500, "CLIENT_FETCH_FAILED", "Failed to fetch client");
  }
}

/** Partial update: only the fields sent change (the old route nulled anything missing and crashed). */
export async function PATCH(request: Request, props: Ctx) {
  const auth = await requireClientAccess("clients.manage");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;
  const { id } = await props.params;

  const existing = await prisma.client.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true, country: true, countryCode: true, taxId: true, isExport: true, logoUrl: true, isWalkIn: true } });
  if (!existing) return clientError(404, "CLIENT_NOT_FOUND", "Client not found");
  const body = await readClientBody(request);
  if (!body) return clientError(400, "INVALID_BODY", "Send the changes as a form or JSON.");
  const parsed = normalizeClientInput(body.fields, { workspaceCountry: ctx.workspaceCountry, partial: true, existing });
  if (!parsed.ok) return validationError(parsed.fields, parsed.suggestion);

  let logoUrl: string | undefined;
  if (body.logo) {
    const stored = await storeClientLogo(ctx.workspaceId, body.logo);
    if (!stored.ok) return stored.response;
    logoUrl = stored.url;
  } else if (body.fields.removeLogo === true || body.fields.removeLogo === "true") logoUrl = "";
  try {
    const res = await updateClient(ctx, id, parsed.data, logoUrl === undefined ? {} : { logoUrl: logoUrl || null });
    if (!res.ok) { if (logoUrl) await removeStoredLogo(logoUrl); return serviceError(res); }
    if (logoUrl !== undefined) await removeStoredLogo(existing.logoUrl);
    return NextResponse.json({ success: true, client: res.client, changed: res.changed });
  } catch (error) {
    console.error("Client update failed:", error);
    if (logoUrl) await removeStoredLogo(logoUrl);
    return clientError(500, "CLIENT_UPDATE_FAILED", "Failed to update client");
  }
}

/** Deletes only a client with no billing history; anything else is archived instead. */
export async function DELETE(_request: Request, props: Ctx) {
  const auth = await requireClientAccess("clients.manage");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  try {
    const res = await deleteClient(auth.ctx, id);
    return res.ok ? NextResponse.json({ success: true }) : serviceError(res);
  } catch (error) {
    console.error("Client delete failed:", error);
    return clientError(500, "CLIENT_DELETE_FAILED", "Failed to delete client");
  }
}
