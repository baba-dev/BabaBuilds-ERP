import "server-only";
import { cache } from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decideAdminAccess, parseAllowlist, type AdminDecision } from "./access";

/** Re-reads the role and email from the database: session claims alone are never enough. */
export const getAdminDecision = cache(async function getAdminDecision(): Promise<AdminDecision & { userId?: string }> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!session || !userId) return decideAdminAccess(null, new Set(), false);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });
  const decision = decideAdminAccess(user, parseAllowlist(process.env.SUPERADMIN_EMAILS), true);
  return { ...decision, userId };
});
