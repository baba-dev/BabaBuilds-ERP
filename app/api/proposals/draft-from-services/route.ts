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
    const serviceTemplateIds = Array.isArray(body?.serviceTemplateIds)
      ? body.serviceTemplateIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      : [];

    if (serviceTemplateIds.length === 0) {
      return NextResponse.json({ error: "Select at least one service." }, { status: 400 });
    }

    const uniqueIds = Array.from(new Set(serviceTemplateIds));
    const templates = await prisma.serviceTemplate.findMany({
      where: {
        workspaceId: session.workspaceId,
        showInShop: true,
        id: { in: uniqueIds },
      },
      include: {
        nicCode: true,
        sacCode: true,
      },
    });

    if (templates.length === 0) {
      return NextResponse.json({ error: "No published services found for this request." }, { status: 404 });
    }

    const templateMap = new Map(templates.map((template) => [template.id, template]));
    const orderedTemplates = uniqueIds
      .map((id) => templateMap.get(id))
      .filter((template): template is NonNullable<typeof template> => Boolean(template));

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
          nicCode: template.nicCode?.code || null,
          sacCodeId: template.sacCodeId,
          sacCode: template.sacCode?.code || null,
          defaultTaxRate: template.sacCode?.igstRate ?? null,
        },
      })),
    };

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Proposal draft from shop services error:", error);
    return NextResponse.json({ error: "Failed to build proposal draft." }, { status: 500 });
  }
}
