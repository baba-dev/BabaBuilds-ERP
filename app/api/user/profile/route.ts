import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const LEGACY_HOME_ROUTE = "/";
const CANONICAL_DASHBOARD_ROUTE = "/dashboard";

function normalizeLandingPage(path: string | null | undefined) {
  return path === LEGACY_HOME_ROUTE || !path ? CANONICAL_DASHBOARD_ROUTE : path;
}

// ==========================================
// GET: Fetch the user's personal settings
// ==========================================
export async function GET() {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;

    // 2. FETCH SPECIFIC FIELDS ONLY
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        image: true,
        theme: true,
        dateFormat: true,
        timeZone: true,
        locale: true,
        currencyFormat: true,
        defaultLandingPage: true,
        transactionalAlerts: true,
        marketingEmails: true,
        weeklyReport: true,
        onboarding: {
          select: {
            isFirstLogin: true,
          },
        },
      },
    });

    if (!userProfile) {
      return NextResponse.json({ error: "User profile not found." }, { status: 404 });
    }

    const { onboarding, ...safeProfile } = userProfile;
    return NextResponse.json({
      ...safeProfile,
      defaultLandingPage: normalizeLandingPage(userProfile.defaultLandingPage),
      isFirstLogin: onboarding?.isFirstLogin ?? true,
    });
  } catch (error) {
    console.error("GET Profile Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ==========================================
// PATCH: Securely update personal settings
// ==========================================
export async function PATCH(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await request.json();

    // 2. STRICT MASS-ASSIGNMENT PROTECTION
    // We explicitly pull ONLY the fields the user is allowed to edit.
    // If they send a malicious payload like { "role": "ADMIN", "email": "hacker@test.com" }, it is ignored.
    const {
      name,
      theme,
      dateFormat,
      timeZone,
      locale,
      currencyFormat,
      defaultLandingPage,
      transactionalAlerts,
      marketingEmails,
      weeklyReport,
    } = body;

    // 3. DATABASE MUTATION
    // We use conditional spreading to only update fields that were actually provided in the request
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name }),
        ...(theme !== undefined && { theme }),
        ...(dateFormat !== undefined && { dateFormat }),
        ...(timeZone !== undefined && { timeZone }),
        ...(locale !== undefined && { locale }),
        ...(currencyFormat !== undefined && { currencyFormat }),
        ...(defaultLandingPage !== undefined && { defaultLandingPage: normalizeLandingPage(defaultLandingPage) }),
        
        // Strict boolean coercion for security
        ...(transactionalAlerts !== undefined && { transactionalAlerts: Boolean(transactionalAlerts) }),
        ...(marketingEmails !== undefined && { marketingEmails: Boolean(marketingEmails) }),
        ...(weeklyReport !== undefined && { weeklyReport: Boolean(weeklyReport) }),
      },
    });

    return NextResponse.json({ success: true, message: "Personal profile updated securely." });
  } catch (error) {
    console.error("PATCH Profile Error:", error);
    return NextResponse.json({ error: "Failed to update profile data." }, { status: 500 });
  }
}
