import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ONBOARDING_STEPS, parseCompletedSteps, serializeCompletedSteps, type OnboardingStepId } from "@/lib/onboarding";

async function getSessionUserId() {
  const session = await getServerSession(authOptions);
  return session && (session.user as any)?.id ? (session.user as any).id as string : null;
}

async function ensureOnboarding(userId: string) {
  return prisma.userOnboarding.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

function buildResponse(record: Awaited<ReturnType<typeof ensureOnboarding>>) {
  const completedSteps = parseCompletedSteps(record.completedSteps);
  const disabled = Boolean(record.dismissedAt || record.completedAt || !record.isFirstLogin);
  return {
    steps: ONBOARDING_STEPS,
    completedSteps,
    isFirstLogin: record.isFirstLogin,
    disabled,
    dismissedAt: record.dismissedAt,
    completedAt: record.completedAt,
  };
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const record = await ensureOnboarding(userId);
  return NextResponse.json(buildResponse(record));
}

export async function PATCH(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, stepId } = await request.json().catch(() => ({}));
  const existing = await ensureOnboarding(userId);
  const now = new Date();

  if (action === "dismiss") {
    const updated = await prisma.userOnboarding.update({
      where: { userId },
      data: { dismissedAt: now, isFirstLogin: false },
    });
    return NextResponse.json(buildResponse(updated));
  }

  if (action === "complete") {
    const updated = await prisma.userOnboarding.update({
      where: { userId },
      data: {
        completedAt: now,
        isFirstLogin: false,
        completedSteps: serializeCompletedSteps(ONBOARDING_STEPS.map((step) => step.id)),
      },
    });
    return NextResponse.json(buildResponse(updated));
  }

  if (action === "complete_step") {
    if (typeof stepId !== "string" || !ONBOARDING_STEPS.some((step) => step.id === stepId)) {
      return NextResponse.json({ error: "Invalid stepId" }, { status: 400 });
    }

    const parsedSteps = parseCompletedSteps(existing.completedSteps);
    const updatedSteps = Array.from(new Set([...parsedSteps, stepId as OnboardingStepId]));
    const allDone = updatedSteps.length >= ONBOARDING_STEPS.length;
    const updated = await prisma.userOnboarding.update({
      where: { userId },
      data: {
        completedSteps: serializeCompletedSteps(updatedSteps),
        ...(allDone && { completedAt: now, isFirstLogin: false }),
      },
    });

    return NextResponse.json(buildResponse(updated));
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
