"use client";

import { Turnstile } from "@marsidev/react-turnstile";
import { TURNSTILE_SITE_KEY } from "@/lib/auth/turnstile-config";

/** Thin wrapper so the Turnstile bundle is only downloaded when a check is actually needed. */
export default function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  return (
    <Turnstile
      siteKey={TURNSTILE_SITE_KEY}
      onSuccess={onToken}
      onExpire={() => onToken("")}
      options={{ theme: "auto", size: "flexible" }}
    />
  );
}
