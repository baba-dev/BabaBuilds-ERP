import { z } from "zod";

export const SIGNUP_INTENT_COOKIE = "signup_intent";

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
  return encodeURIComponent(JSON.stringify(intent));
}

export function deserializeSignupIntent(raw: string | null | undefined): SignupIntent | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    return signupIntentSchema.parse(parsed);
  } catch {
    return null;
  }
}
