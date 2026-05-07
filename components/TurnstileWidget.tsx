"use client";

import { Turnstile } from "@marsidev/react-turnstile";
import type { ComponentProps } from "react";

interface Props {
  onVerify: (token: string) => void;
  className?: string;
  options?: ComponentProps<typeof Turnstile>["options"];
}

export default function TurnstileWidget({ onVerify, className = "flex justify-center my-4", options }: Props) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    return null;
  }

  return (
    <div className={className}>
      <Turnstile
        siteKey={siteKey}
        onSuccess={(token) => onVerify(token)}
        options={{
          theme: "auto",
          size: "normal",
          ...options,
        }}
      />
    </div>
  );
}
