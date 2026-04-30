"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { parseSignupIntent } from "@/lib/signup-intent";

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

    void fetch("/api/signup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(intent),
      credentials: "same-origin",
      keepalive: true,
    });

    const callbackUrl = `/dashboard?fromSignup=1&plan=${intent.plan}&cycle=${intent.cycle}`;
    window.location.replace(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }, [searchParams]);

  return null;
}
