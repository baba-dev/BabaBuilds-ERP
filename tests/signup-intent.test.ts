import { describe, expect, it, beforeEach } from "vitest";
import { deserializeSignupIntent, serializeSignupIntent, signupIntentSchema } from "@/lib/signup-intent";

describe("signup intent cookie signing", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret";
  });

  it("rejects tampered payload", () => {
    const token = serializeSignupIntent(signupIntentSchema.parse({ plan: "pro", cycle: "monthly", trial: 15 }));
    const [version, , sig] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ plan: "team", cycle: "annual", trial: 30 }),
      "utf8",
    ).toString("base64url");

    const tamperedToken = `${version}.${tamperedPayload}.${sig}`;
    expect(deserializeSignupIntent(tamperedToken)).toBeNull();
  });

  it("preserves trial length in serialized payload", () => {
    const intent = signupIntentSchema.parse({ plan: "pro", cycle: "monthly", trial: 30 });
    const restored = deserializeSignupIntent(serializeSignupIntent(intent));
    expect(restored?.trial).toBe(30);
  });

  it("rejects invalid signature", () => {
    const token = serializeSignupIntent(signupIntentSchema.parse({ plan: "pro", cycle: "monthly", trial: 15 }));
    const [version, payload] = token.split(".");
    const invalidToken = `${version}.${payload}.bad-signature`;

    expect(deserializeSignupIntent(invalidToken)).toBeNull();
  });
});
