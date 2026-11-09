export type ConfigStatus = "ok" | "warn" | "missing";
export type ConfigCheck = { key: string; label: string; status: ConfigStatus; required: boolean; hint: string };

type Env = Record<string, string | undefined>;
const has = (v: string | undefined) => !!v && v.trim() !== "";

/**
 * What the server is configured with, by name only. Values are never returned. Required items that are missing explain
 * the "it does not work" cases an operator hits (no allowlist, no cron secret, no encryption key).
 */
export function checkConfig(env: Env): ConfigCheck[] {
  const prod = env.NODE_ENV === "production" || env.ERP_SECURITY_MODE === "PRODUCTION";
  const c = (key: string, label: string, ok: boolean, required: boolean, hint: string, weak = false): ConfigCheck => ({ key, label, required, hint, status: ok ? (weak ? "warn" : "ok") : required ? "missing" : "warn" });
  return [
    c("SUPERADMIN_EMAILS", "Super-admin allowlist", has(env.SUPERADMIN_EMAILS), true, "Comma-separated emails allowed into this console."),
    c("NEXTAUTH_SECRET", "Session signing secret", has(env.NEXTAUTH_SECRET), true, "Signs sign-in sessions.", has(env.NEXTAUTH_SECRET) && (env.NEXTAUTH_SECRET as string).length < 32),
    c("NEXTAUTH_URL", "Public app URL", has(env.NEXTAUTH_URL), prod, "The address people use to reach the app."),
    c("ENCRYPTION_KEY", "Data encryption key", /^[0-9a-fA-F]{64}$/.test(env.ENCRYPTION_KEY ?? ""), prod, "64 hex characters. Protects stored SMTP, AI and gateway secrets."),
    c("CRON_SECRET", "Scheduled-job secret", has(env.CRON_SECRET), prod, "Lets the server's scheduler call the /api/cron routes."),
    c("EMAIL_SERVER", "System email (sign-in codes, alerts)", has(env.EMAIL_SERVER_HOST) && has(env.EMAIL_SERVER_USER) && has(env.EMAIL_SERVER_PASSWORD), false, "EMAIL_SERVER_HOST, _USER and _PASSWORD."),
    c("TURNSTILE_SECRET_KEY", "Bot check (Turnstile)", has(env.TURNSTILE_SECRET_KEY), prod, "Protects sign-up and login from bots."),
    c("CROWDSEC", "CrowdSec firewall bouncer", has(env.CROWDSEC_LAPI_URL) && has(env.CROWDSEC_BOUNCER_KEY), false, "CROWDSEC_LAPI_URL and CROWDSEC_BOUNCER_KEY."),
    c("DIAGNOSTICS_APPROVAL_PUBLIC_KEY", "Diagnostics approval key", has(env.DIAGNOSTICS_APPROVAL_PUBLIC_KEY), false, "Public half of the signing key for diagnostics approvals."),
    c("RAZORPAY", "Platform billing: Razorpay", has(env.RAZORPAY_KEY_ID) && has(env.RAZORPAY_KEY_SECRET), false, "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."),
    c("STRIPE_SECRET_KEY", "Platform billing: Stripe", has(env.STRIPE_SECRET_KEY), false, "Needed only if you bill in Stripe."),
  ];
}

export const configSummary = (checks: ConfigCheck[]) => ({
  missing: checks.filter((c) => c.status === "missing").length,
  warnings: checks.filter((c) => c.status === "warn").length,
});
