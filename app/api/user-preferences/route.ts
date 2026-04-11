import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  getUserPreferences,
  updateUserPreferences,
} from "@/src/server/user-preferences/service";
import {
  sanitizeUserPreferencesPatch,
  type UserPreferences,
} from "@/src/types/user-preferences";

function getSessionUserId(session: unknown): string | null {
  const maybeId = (session as { user?: { id?: string | null } })?.user?.id;
  return typeof maybeId === "string" && maybeId.length > 0 ? maybeId : null;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = getSessionUserId(session);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getUserPreferences(userId);
    return NextResponse.json(preferences);
  } catch (error) {
    console.error("GET user-preferences error", error);
    return NextResponse.json({ error: "Failed to load user preferences." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = getSessionUserId(session);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<UserPreferences>;
    const next = await updateUserPreferences(userId, sanitizeUserPreferencesPatch(body));

    return NextResponse.json(next);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save user preferences.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
