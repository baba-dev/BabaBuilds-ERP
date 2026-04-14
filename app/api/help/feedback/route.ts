import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type FeedbackPayload = {
  slug: string;
  helpful: boolean;
  comment?: string;
  pagePath?: string;
};

function getSessionWorkspaceId(session: unknown): string | null {
  const maybeId = (session as { workspaceId?: string | null })?.workspaceId;
  return typeof maybeId === "string" && maybeId.length > 0 ? maybeId : null;
}

function getSessionUserId(session: unknown): string | null {
  const maybeId = (session as { user?: { id?: string | null } })?.user?.id;
  return typeof maybeId === "string" && maybeId.length > 0 ? maybeId : null;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = getSessionWorkspaceId(session);
    const userId = getSessionUserId(session);

    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as FeedbackPayload;
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const helpful = Boolean(body.helpful);
    const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 1000) : null;
    const pagePath = typeof body.pagePath === "string" ? body.pagePath.trim().slice(0, 400) : null;

    if (!slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }

    await prisma.helpFeedback.create({
      data: {
        workspaceId,
        userId,
        docSlug: slug,
        helpful,
        comment,
        currentRoute: pagePath,
        userAgent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/help/feedback error", error);
    return NextResponse.json({ error: "Failed to save feedback." }, { status: 500 });
  }
}

