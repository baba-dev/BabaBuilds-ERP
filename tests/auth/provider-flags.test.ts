import { afterEach, describe, expect, it } from "vitest";
import { getGoogleAuthMissingEnvVars, isGoogleAuthEnabled } from "@/lib/auth/provider-flags";

const ORIGINAL_ENV = { ...process.env };

function setGoogleAuthEnv(values: {
  authGoogleEnabled?: string;
  googleClientId?: string;
  googleClientSecret?: string;
}) {
  delete process.env.AUTH_GOOGLE_ENABLED;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;

  if (values.authGoogleEnabled !== undefined) {
    process.env.AUTH_GOOGLE_ENABLED = values.authGoogleEnabled;
  }

  if (values.googleClientId !== undefined) {
    process.env.GOOGLE_CLIENT_ID = values.googleClientId;
  }

  if (values.googleClientSecret !== undefined) {
    process.env.GOOGLE_CLIENT_SECRET = values.googleClientSecret;
  }
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("Google auth provider flags", () => {
  it("enables Google auth when the toggle is unset and both Google OAuth env vars are present", () => {
    setGoogleAuthEnv({
      googleClientId: "client-id",
      googleClientSecret: "client-secret",
    });

    expect(isGoogleAuthEnabled()).toBe(true);
    expect(getGoogleAuthMissingEnvVars()).toEqual([]);
  });

  it("disables Google auth when AUTH_GOOGLE_ENABLED is explicitly false", () => {
    setGoogleAuthEnv({
      authGoogleEnabled: " false ",
      googleClientId: "client-id",
      googleClientSecret: "client-secret",
    });

    expect(isGoogleAuthEnabled()).toBe(false);
    expect(getGoogleAuthMissingEnvVars()).toEqual([]);
  });

  it("disables Google auth when either Google OAuth env var is missing", () => {
    setGoogleAuthEnv({ googleClientId: "client-id" });

    expect(isGoogleAuthEnabled()).toBe(false);
    expect(getGoogleAuthMissingEnvVars()).toEqual(["GOOGLE_CLIENT_SECRET"]);
  });

  it("treats blank Google OAuth env vars as missing", () => {
    setGoogleAuthEnv({
      googleClientId: "  ",
      googleClientSecret: "client-secret",
    });

    expect(isGoogleAuthEnabled()).toBe(false);
    expect(getGoogleAuthMissingEnvVars()).toEqual(["GOOGLE_CLIENT_ID"]);
  });
});