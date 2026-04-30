import { NextResponse } from "next/server";
import {
  SIGNUP_INTENT_COOKIE,
  SIGNUP_INTENT_MAX_AGE_SECONDS,
  signupIntentSchema,
  serializeSignupIntent,
} from "@/lib/signup-intent";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const intent = signupIntentSchema.parse(body);
    const response = NextResponse.json({ ok: true });
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
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
