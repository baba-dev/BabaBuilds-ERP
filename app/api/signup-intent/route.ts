import { NextResponse } from "next/server";
import { signupIntentSchema } from "@/lib/signup-intent";
import { applySignupIntentCookie } from "@/lib/signup-intent-cookie";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const intent = signupIntentSchema.parse(body);
    const response = NextResponse.json({ ok: true });
    return applySignupIntentCookie(response, intent);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
