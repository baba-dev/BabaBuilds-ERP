import "server-only";

const GOOGLE_AUTH_ENV_VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
const EXPLICITLY_DISABLED_VALUES = new Set(["false", "0", "no", "off"]);

function hasNonEmptyEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function isExplicitlyDisabled(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized ? EXPLICITLY_DISABLED_VALUES.has(normalized) : false;
}

export function getGoogleAuthMissingEnvVars() {
  return GOOGLE_AUTH_ENV_VARS.filter((envName) => !hasNonEmptyEnv(envName));
}

export function isGoogleAuthEnabled() {
  return (
    !isExplicitlyDisabled(process.env.AUTH_GOOGLE_ENABLED) &&
    getGoogleAuthMissingEnvVars().length === 0
  );
}