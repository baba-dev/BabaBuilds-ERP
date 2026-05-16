import type { NextResponse } from "next/server";
import {
  SIGNUP_INTENT_COOKIE,
  SIGNUP_INTENT_MAX_AGE_SECONDS,
  serializeSignupIntent,
  type SignupIntent,
} from "@/lib/signup-intent";

/** Attach signed signup intent to a Route Handler response. */
export function applySignupIntentCookie(response: NextResponse, intent: SignupIntent): NextResponse {
  response.cookies.set({
    name: SIGNUP_INTENT_COOKIE,
    value: serializeSignupIntent(intent),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SIGNUP_INTENT_MAX_AGE_SECONDS,
  });
  return response;
}
