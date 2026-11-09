import { validateGstin } from "@/lib/gst/gstin";
import { validateUdyam } from "@/lib/msme/udyam";

export type CheckStatus = "done" | "todo" | "optional" | "na";

export type CheckKey = "identity" | "contact" | "logo" | "pan" | "gstin" | "udyam" | "bank" | "email" | "payments" | "shop" | "team";

export type SetupCheck = {
  key: CheckKey;
  /** Settings section that fixes it. */
  section: string;
  status: CheckStatus;
};

export type OverviewInput = {
  countryCode: string;
  profile: {
    companyName?: string | null; proprietorName?: string | null; address?: string | null; email?: string | null; phone?: string | null; website?: string | null;
    logoUrl?: string | null; panNumber?: string | null; gstin?: string | null; udyamNumber?: string | null; gstRegistrationType?: string | null;
    bankName?: string | null; accountName?: string | null; ifscCode?: string | null; hasBankAccountNumber: boolean;
    smtpHost?: string | null; smtpUser?: string | null; hasSmtpPassword: boolean;
    razorpayKeyId?: string | null; stripePublishableKey?: string | null; hasRazorpayKeySecret: boolean; hasStripeSecretKey: boolean;
    shopEnabled?: boolean | null; shopSlug?: string | null;
  } | null;
  gatewaysEntitled: boolean;
  activeMembers: number;
};

const filled = (v: string | null | undefined) => !!v && v.trim() !== "";
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * What is set up and what is not, in the order a new business needs it. Required items are "todo"; nice-to-haves are
 * "optional"; things that do not apply to this business (GSTIN for an unregistered seller) are "na". Pure, so the rules are testable.
 */
export function buildOverview(input: OverviewInput): { checks: SetupCheck[]; percent: number; open: number } {
  const p = input.profile;
  const india = input.countryCode.toUpperCase() === "IN";
  const unregistered = (p?.gstRegistrationType ?? "REGULAR") === "UNREGISTERED";
  const st = (ok: boolean, whenMissing: CheckStatus = "todo"): CheckStatus => (ok ? "done" : whenMissing);

  const checks: SetupCheck[] = [
    { key: "identity", section: "business", status: st(!!p && filled(p.companyName) && filled(p.proprietorName) && filled(p.address) && filled(p.email)) },
    { key: "contact", section: "business", status: st(!!p && filled(p.phone) && filled(p.website), "optional") },
    { key: "logo", section: "business", status: st(!!p && filled(p.logoUrl), "optional") },
    { key: "pan", section: "tax", status: india ? st(!!p && PAN.test((p.panNumber ?? "").trim().toUpperCase())) : st(!!p && filled(p.panNumber), "optional") },
    { key: "gstin", section: "tax", status: !india || unregistered ? "na" : st(!!p && !!p.gstin && validateGstin(p.gstin.trim().toUpperCase()).valid) },
    { key: "udyam", section: "tax", status: !india ? "na" : st(!!p && !!p.udyamNumber && validateUdyam(p.udyamNumber).valid, "optional") },
    { key: "bank", section: "banking", status: st(!!p && filled(p.bankName) && filled(p.accountName) && filled(p.ifscCode) && p.hasBankAccountNumber) },
    { key: "email", section: "email", status: st(!!p && filled(p.smtpHost) && filled(p.smtpUser) && p.hasSmtpPassword, "optional") },
    { key: "payments", section: "payments", status: !input.gatewaysEntitled ? "na" : st(!!p && ((filled(p.razorpayKeyId) && p.hasRazorpayKeySecret) || (filled(p.stripePublishableKey) && p.hasStripeSecretKey)), "optional") },
    { key: "shop", section: "shop", status: st(!!p && !!p.shopEnabled && filled(p.shopSlug), "optional") },
    { key: "team", section: "team", status: st(input.activeMembers > 1, "optional") },
  ];
  const counted = checks.filter((c) => c.status !== "na");
  const done = counted.filter((c) => c.status === "done").length;
  return { checks, percent: counted.length ? Math.round((done / counted.length) * 100) : 100, open: counted.length - done };
}
