"use client";

import { Turnstile } from "@marsidev/react-turnstile";

interface Props {
  onVerify: (token: string) => void;
}

export default function TurnstileWidget({ onVerify }: Props) {
  return (
    <div className="flex justify-center my-4">
      <Turnstile
        siteKey="0x4AAAAAACvSwAyJa3nVFu2n"
        onSuccess={(token) => onVerify(token)}
        options={{
          theme: "light",
          size: "normal",
        }}
      />
    </div>
  );
}