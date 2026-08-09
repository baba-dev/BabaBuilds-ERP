import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "@/app/api/admin/authz";
import {
  expectedPrismaActionType,
  parseRemediationContent,
  RemediationPolicyError,
  verifyOutOfBandApproval,
} from "@/lib/diagnostics/remediation-policy";

const requestSchema = z.object({
  remediationId: z.string().min(1).max(128),
  approval: z.unknown(),
}).strict();

export async function POST(req: Request) {
  try {
    const actor = await verifySuperAdmin();
    const parsedRequest = requestSchema.safeParse(await req.json());
    if (!parsedRequest.success) {
      return NextResponse.json(
        { error: "Invalid request", code: "INVALID_REQUEST" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const remediation = await prisma.systemRemediation.findUnique({
      where: { id: parsedRequest.data.remediationId },
    });
    if (!remediation) {
      return NextResponse.json(
        { error: "Remediation not found", code: "NOT_FOUND" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (remediation.status !== "PENDING_APPROVAL") {
      return NextResponse.json(
        { error: "Remediation is not pending approval", code: "INVALID_STATE" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const action = parseRemediationContent(remediation.content);
    if (remediation.actionType !== expectedPrismaActionType(action)) {
      throw new RemediationPolicyError("Stored remediation type does not match its payload");
    }

    const approval = verifyOutOfBandApproval({
      envelope: parsedRequest.data.approval,
      remediationId: remediation.id,
      remediationContent: remediation.content,
      publicKeyPem: process.env.DIAGNOSTICS_APPROVAL_PUBLIC_KEY,
    });

    const update = await prisma.systemRemediation.updateMany({
      where: { id: remediation.id, status: "PENDING_APPROVAL" },
      data: {
        status: "APPROVED",
        executedBy: actor.email,
        executionLog: JSON.stringify({
          event: "APPROVED_OUT_OF_BAND",
          approvedAt: new Date().toISOString(),
          approvedBy: actor.email,
          payloadSha256: approval.payloadSha256,
          approvalNonce: approval.nonce,
          approvalExpiresAt: approval.expiresAt,
        }),
      },
    });
    if (update.count !== 1) {
      return NextResponse.json(
        { error: "Remediation state changed", code: "STATE_CONFLICT" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        status: "APPROVED",
        message: "Approved for the separately operated remediation worker; nothing was executed by the web process.",
      },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof RemediationPolicyError) {
      return NextResponse.json(
        { error: error.message, code: "INVALID_REMEDIATION_APPROVAL" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return handleAdminApiError(error, "Remediation approval failed");
  }
}
