import { z } from "zod";
import { createHmac, timingSafeEqual } from "crypto";

export const SIGNUP_INTENT_COOKIE = "signup_intent";
export const SIGNUP_INTENT_MAX_AGE_SECONDS = 60 * 10;
const SIGNUP_INTENT_HMAC_VERSION = "v1";

const planSchema = z.enum(["pro", "team"]);
const cycleSchema = z.enum(["monthly", "annual"]);
const trialSchema = z.coerce.number().int().min(1).max(30).default(15);
const personaSchema = z.enum(["ca", "agency", "freelancer", "contractor"]).optional();

export const signupIntentSchema = z.object({
  plan: planSchema.default("pro"),
  cycle: cycleSchema.default("monthly"),
  trial: trialSchema,
  persona: personaSchema,
  fromDemo: z.boolean().optional(),
  demoTemplate: z.string().optional(),
  resellerCode: z.string().trim().min(1).max(64).optional(),
  source: z.string().trim().min(1).max(64).optional(),
});

export type SignupIntent = z.infer<typeof signupIntentSchema>;

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSignupIntentSecret(): string {
  const secret = process.env.SIGNUP_INTENT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Missing SIGNUP_INTENT_SECRET or NEXTAUTH_SECRET for signup intent cookie signing.");
  }
  return secret;
}

function signPayload(payloadBase64: string): string {
  return createHmac("sha256", getSignupIntentSecret()).update(payloadBase64).digest("base64url");
}

export function parseSignupIntent(input: {
  plan?: string | null;
  cycle?: string | null;
  trial?: string | null;
  persona?: string | null;
  fromDemo?: string | null;
  demoTemplate?: string | null;
  resellerCode?: string | null;
  source?: string | null;
}): SignupIntent {
  return signupIntentSchema.parse({
    plan: input.plan ?? undefined,
    cycle: input.cycle ?? undefined,
    trial: input.trial ?? undefined,
    persona: input.persona ?? undefined,
    fromDemo: input.fromDemo === "1" || input.fromDemo === "true" ? true : undefined,
    demoTemplate: input.demoTemplate ?? undefined,
    resellerCode: input.resellerCode ?? undefined,
    source: input.source ?? undefined,
  });
}

export function serializeSignupIntent(intent: SignupIntent): string {
  const payloadBase64 = base64UrlEncode(JSON.stringify(intent));
  const signature = signPayload(payloadBase64);
  return `${SIGNUP_INTENT_HMAC_VERSION}.${payloadBase64}.${signature}`;
}

export function deserializeSignupIntent(raw: string | null | undefined): SignupIntent | null {
  if (!raw) return null;
  try {
    const [version, payloadBase64, signature] = raw.split(".");
    if (version !== SIGNUP_INTENT_HMAC_VERSION || !payloadBase64 || !signature) return null;

    const expectedSignature = signPayload(payloadBase64);
    const suppliedBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    if (suppliedBuffer.length !== expectedBuffer.length) return null;
    if (!timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;

    const parsed = JSON.parse(base64UrlDecode(payloadBase64)) as unknown;
    return signupIntentSchema.parse(parsed);
  } catch {
    return null;
  }
}
