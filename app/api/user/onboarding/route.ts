import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ONBOARDING_STEPS, isDemoEmail, parseCompletedSteps, serializeCompletedSteps, type OnboardingStepId } from "@/lib/onboarding";

async function getSessionUser() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; email?: string | null } | undefined;
  if (!session || !sessionUser?.id) return null;
  return {
    id: sessionUser.id,
    email: sessionUser.email ?? null,
  };
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
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isDemoEmail(sessionUser.email)) {
    return NextResponse.json({
      steps: ONBOARDING_STEPS,
      completedSteps: [],
      isFirstLogin: false,
      disabled: true,
      dismissedAt: new Date().toISOString(),
      completedAt: null,
      isDemoUser: true,
    });
  }

  const record = await ensureOnboarding(sessionUser.id);
  return NextResponse.json(buildResponse(record));
}

export async function PATCH(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isDemoEmail(sessionUser.email)) {
    return NextResponse.json({ error: "Onboarding updates are disabled for demo users." }, { status: 403 });
  }

  const { action, stepId } = await request.json().catch(() => ({}));
  const existing = await ensureOnboarding(sessionUser.id);
  const now = new Date();

  if (action === "dismiss") {
    const updated = await prisma.userOnboarding.update({
      where: { userId: sessionUser.id },
      data: { dismissedAt: now, isFirstLogin: false },
    });
    return NextResponse.json(buildResponse(updated));
  }

  if (action === "complete") {
    const updated = await prisma.userOnboarding.update({
      where: { userId: sessionUser.id },
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
      where: { userId: sessionUser.id },
      data: {
        completedSteps: serializeCompletedSteps(updatedSteps),
        ...(allDone && { completedAt: now, isFirstLogin: false }),
      },
    });

    return NextResponse.json(buildResponse(updated));
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
