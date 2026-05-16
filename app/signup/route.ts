import { NextRequest, NextResponse } from "next/server";
import { parseSignupIntent } from "@/lib/signup-intent";
import { applySignupIntentCookie } from "@/lib/signup-intent-cookie";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  try {
    const intent = parseSignupIntent({
      plan: searchParams.get("plan"),
      cycle: searchParams.get("cycle"),
      trial: searchParams.get("trial"),
      persona: searchParams.get("persona"),
      fromDemo: searchParams.get("fromDemo"),
      demoTemplate: searchParams.get("demoTemplate"),
      resellerCode: searchParams.get("resellerCode"),
      source: searchParams.get("source") ?? "signup_page",
    });

    const callbackUrl = `/dashboard?fromSignup=1&plan=${intent.plan}&cycle=${intent.cycle}`;
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", callbackUrl);

    const response = NextResponse.redirect(loginUrl);
    return applySignupIntentCookie(response, intent);
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
