import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SessionContext = {
  workspaceId?: string;
};

export async function POST(request: Request) {
  try {
    const session = (await getServerSession(authOptions)) as SessionContext | null;
    if (!session?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const serviceTemplateIds: string[] = Array.isArray(body?.serviceTemplateIds)
      ? body.serviceTemplateIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      : [];

    if (serviceTemplateIds.length === 0) {
      return NextResponse.json({ error: "Select at least one service." }, { status: 400 });
    }

    const uniqueIds: string[] = Array.from(new Set(serviceTemplateIds));
    const templates = await prisma.serviceTemplate.findMany({
      where: {
        workspaceId: session.workspaceId,
        id: { in: uniqueIds },
      },
    });

    if (templates.length === 0) {
      return NextResponse.json({ error: "No services found for this request." }, { status: 404 });
    }

    const templateMap = new Map<string, (typeof templates)[number]>(templates.map((template) => [template.id, template]));
    const orderedTemplates = uniqueIds
      .map((id) => templateMap.get(id))
      .filter((template): template is NonNullable<typeof template> => Boolean(template));

    const nicIds = Array.from(
      new Set(
        orderedTemplates
          .map((template) => template.nicCodeId)
          .filter((id): id is string => Boolean(id))
      )
    );
    const sacIds = Array.from(
      new Set(
        orderedTemplates
          .map((template) => template.sacCodeId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const [nicCodes, sacCodes] = await Promise.all([
      nicIds.length ? prisma.nICCode.findMany({ where: { id: { in: nicIds } } }) : Promise.resolve([]),
      sacIds.length ? prisma.sACCode.findMany({ where: { id: { in: sacIds } } }) : Promise.resolve([]),
    ]);
    const nicMap = new Map(nicCodes.map((code) => [code.id, code]));
    const sacMap = new Map(sacCodes.map((code) => [code.id, code]));

    const draft = {
      title:
        orderedTemplates.length === 1
          ? `${orderedTemplates[0].name} Proposal`
          : `Shop Service Bundle Proposal (${orderedTemplates.length} items)`,
      items: orderedTemplates.map((template) => ({
        serviceTemplateId: template.id,
        title: template.name,
        description: template.description || "",
        quantity: 1,
        unitPrice: Number(template.defaultPrice || 0),
        taxMapping: {
          nicCodeId: template.nicCodeId,
          nicCode: template.nicCodeId ? nicMap.get(template.nicCodeId)?.code || null : null,
          sacCodeId: template.sacCodeId,
          sacCode: template.sacCodeId ? sacMap.get(template.sacCodeId)?.code || null : null,
          defaultTaxRate: template.sacCodeId ? sacMap.get(template.sacCodeId)?.igstRate ?? null : null,
        },
      })),
    };

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Proposal draft from shop services error:", error);
    return NextResponse.json({ error: "Failed to build proposal draft." }, { status: 500 });
  }
}
