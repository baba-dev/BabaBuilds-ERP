import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { checkPermissionSilent } from "@/lib/rbac";

export type ApprovalStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
export const APPROVAL_STATUSES: ApprovalStatus[] = ["DRAFT", "PENDING", "APPROVED", "REJECTED"];

export async function getExpenseSettings(workspaceId: string) {
  const row = await prisma.expenseSettings.findUnique({ where: { workspaceId } });
  return { approvalRequired: row?.approvalRequired ?? false, approvalThreshold: Number(row?.approvalThreshold ?? 0), inboxEnabled: row?.inboxEnabled ?? false, inboxToken: row?.inboxToken ?? null };
}

/** With approval on, a person who cannot approve parks entries at or above the threshold as PENDING; approvers' own entries go straight in. */
export function decideApproval(settings: { approvalRequired: boolean; approvalThreshold: number }, amount: number, canApprove: boolean): ApprovalStatus {
  if (!settings.approvalRequired || canApprove) return "APPROVED";
  return amount >= settings.approvalThreshold ? "PENDING" : "APPROVED";
}

export async function approvalForNewExpense(workspaceId: string, userId: string, amount: number): Promise<ApprovalStatus> {
  const settings = await getExpenseSettings(workspaceId);
  if (!settings.approvalRequired) return "APPROVED";
  const canApprove = await checkPermissionSilent(userId, workspaceId, "expenses.approve");
  return decideApproval(settings, amount, canApprove);
}

export const newInboxToken = () => randomBytes(18).toString("base64url");
