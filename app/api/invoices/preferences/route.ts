import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, requireInvoiceAccess } from "@/lib/invoices/auth";

const patchSchema = z.object({
  taxEstimateEnabled: z.boolean(),
  taxEstimateRatePercent: z.number().min(1).max(100).optional(),
});

/** Optional "tax estimate" card on /income (India professionals). Stored on WorkspaceTaxPreference. */
export async function PATCH(request: Request) {
  try {
    const auth = await requireInvoiceAccess("invoices.edit");
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.access;

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(400, "INVALID_PAYLOAD", "Invalid payload.");

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { countryCode: true } });
    if (workspace?.countryCode !== "IN") {
      return apiError(409, "NOT_ELIGIBLE", "The tax estimate is only available for workspaces in India.");
    }

    const data = {
      taxEstimateEnabled: parsed.data.taxEstimateEnabled,
      ...(parsed.data.taxEstimateRatePercent !== undefined ? { taxEstimateRatePercent: parsed.data.taxEstimateRatePercent } : {}),
      updatedBy: userId,
    };
    await prisma.workspaceTaxPreference.upsert({
      where: { workspaceId },
      create: { workspaceId, ...data },
      update: data,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API Error saving invoice preferences:", error);
    return apiError(500, "PREFERENCES_FAILED", "Failed to save preferences.");
  }
}
