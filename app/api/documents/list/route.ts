import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from "@/lib/rbac";

const parseBool = (v: string | null) => v === "1" || v === "true";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!workspaceId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireModule(workspaceId, "DOCUMENTS");
    await requirePermission(userId, workspaceId, "documents.view");
  } catch (e) {
    if (e instanceof ModuleDisabledError) {
      return NextResponse.json({ error: "Documents module is disabled" }, { status: 403 });
    }
    if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
    throw e;
  }

  const url = new URL(req.url);
  const includeArchived = parseBool(url.searchParams.get("archived"));
  const q = (url.searchParams.get("q") ?? "").trim();

  const docs = await prisma.document.findMany({
    where: {
      workspaceId,
      isArchived: includeArchived ? undefined : false,
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { category: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      category: true,
      scope: true,
      status: true,
      isArchived: true,
      createdAt: true,
      uploadedByUserId: true,
      aiSummary: true,
      aiMeta: true,
      files: {
        where: { isCurrent: true },
        take: 1,
        select: { mimeType: true, byteSize: true, storedPath: true, originalName: true },
      },
      links: {
        take: 6,
        select: { targetType: true, targetId: true, relation: true },
      },
      ocrJobs: {
        orderBy: { queuedAt: "desc" },
        take: 1,
        select: { status: true, kind: true, provider: true, finishedAt: true },
      },
    },
  });

  return NextResponse.json({ documents: docs });
}

