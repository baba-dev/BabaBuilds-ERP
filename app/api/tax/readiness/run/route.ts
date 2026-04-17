import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { runIndiaTaxReturnPrep } from "@/lib/tax/return-prep";
import { withPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { buildTaxRequestHash, consumeTaxIdempotency } from "@/lib/tax/idempotency";
import { newTaxCorrelationId } from "@/lib/tax/audit";

type SessionWithWorkspace = {
  workspaceId?: string | null;
};

export async function POST(request: Request) {
  try {
    const session = (await getServerSession(authOptions)) as SessionWithWorkspace | null;
    const workspaceId = session?.workspaceId;
    const userId = (session as { user?: { id?: string | null } } | null)?.user?.id as string | undefined;

    if (!workspaceId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const perm = await withPermission(userId, workspaceId, "tax.readiness.run");
    if (!perm.granted) return perm.response;

    const body = (await request.json()) as { taxPeriodId?: string };

    if (!body?.taxPeriodId) {
      return NextResponse.json({ error: "taxPeriodId is required." }, { status: 400 });
    }

    const taxPeriodId = body.taxPeriodId;
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || null;
    const requestHash = buildTaxRequestHash({ taxPeriodId });

    const outcome = await consumeTaxIdempotency({
      db: prisma,
      workspaceId,
      operation: "TAX_READINESS_RUN",
      idempotencyKey,
      requestHash,
      execute: async () => {
        const correlationId = newTaxCorrelationId();
        return runIndiaTaxReturnPrep({
          workspaceId,
          taxPeriodId,
          correlationId,
          actorUserId: userId,
        });
      },
    });

    if (outcome.kind === "conflict") {
      return NextResponse.json(
        { error: "Idempotency-Key reuse with different request payload is not allowed." },
        { status: 409 },
      );
    }

    if (outcome.kind === "replay") {
      return NextResponse.json({ data: outcome.body, replayed: true });
    }

    return NextResponse.json({ data: outcome.body });
  } catch (error) {
    console.error("Tax readiness run failed", error);
    return NextResponse.json({ error: "Failed to run tax readiness pipeline." }, { status: 500 });
  }
}
