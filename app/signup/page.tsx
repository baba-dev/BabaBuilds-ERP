"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { parseSignupIntent, SIGNUP_INTENT_COOKIE, serializeSignupIntent } from "@/lib/signup-intent";

export default function SignupPage() {
  const searchParams = useSearchParams();

  useEffect(() => {
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

    const serializedIntent = serializeSignupIntent(intent);
    document.cookie = `${SIGNUP_INTENT_COOKIE}=${serializedIntent}; Path=/; Max-Age=1800; SameSite=Lax`;

    const callbackUrl = `/dashboard?fromSignup=1&plan=${intent.plan}&cycle=${intent.cycle}`;
    window.location.replace(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }, [searchParams]);

  return null;
}
