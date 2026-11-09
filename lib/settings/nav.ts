/** The settings map. Each entry is a section on /settings or a page under /settings/*. Labels live in messages (SettingsHub.nav). */
export const SECTION_KEYS = ["business", "tax", "invoicing", "banking", "modules", "automation", "email", "payments", "shop", "ai", "app"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export type NavGroup = "business" | "operations" | "channels" | "account";

export type NavEntry = {
  key: string;
  group: NavGroup;
  /** Name of a lucide icon, resolved on the client. */
  icon: string;
  href: string;
  /** Extra search words, lower case. */
  keywords: string[];
};

export const NAV: NavEntry[] = [
  { key: "business", group: "business", icon: "Building2", href: "/settings?section=business", keywords: ["company", "name", "address", "logo", "signature", "language", "locale", "phone", "email"] },
  { key: "tax", group: "business", icon: "Landmark", href: "/settings?section=tax", keywords: ["gst", "gstin", "pan", "udyam", "msme", "sac", "tax rate", "vat", "registration"] },
  { key: "invoicing", group: "business", icon: "FileText", href: "/settings?section=invoicing", keywords: ["invoice", "prefix", "numbering", "theme", "design", "payment terms", "due date"] },
  { key: "banking", group: "business", icon: "Banknote", href: "/settings?section=banking", keywords: ["bank", "account", "ifsc", "swift", "remittance"] },
  { key: "modules", group: "operations", icon: "Blocks", href: "/settings?section=modules", keywords: ["modules", "payroll", "workforce", "pos", "documents", "cash flow", "reporting", "import", "multi company", "collections", "pipeline"] },
  { key: "automation", group: "operations", icon: "BellRing", href: "/settings?section=automation", keywords: ["reminders", "automation", "notifications", "gst reminders", "digest"] },
  { key: "imports", group: "operations", icon: "UploadCloud", href: "/settings/imports", keywords: ["import", "csv", "migrate", "data"] },
  { key: "email", group: "channels", icon: "Mail", href: "/settings?section=email", keywords: ["smtp", "email", "mail", "sender", "password"] },
  { key: "payments", group: "channels", icon: "CreditCard", href: "/settings?section=payments", keywords: ["razorpay", "stripe", "gateway", "payment link", "keys"] },
  { key: "shop", group: "channels", icon: "Store", href: "/settings?section=shop", keywords: ["shop", "store", "storefront", "slug", "public"] },
  { key: "ai", group: "channels", icon: "Bot", href: "/settings?section=ai", keywords: ["ai", "groq", "assistant", "key"] },
  { key: "team", group: "account", icon: "Users", href: "/settings/team", keywords: ["team", "members", "roles", "invite", "permissions", "access"] },
  { key: "security", group: "account", icon: "ShieldCheck", href: "/settings/security", keywords: ["security", "mfa", "passkey", "password", "2fa", "google"] },
  { key: "billing", group: "account", icon: "Receipt", href: "/settings/billing", keywords: ["billing", "plan", "subscription", "upgrade", "invoices"] },
  { key: "profile", group: "account", icon: "UserRound", href: "/settings/profile", keywords: ["profile", "me", "avatar", "personal"] },
  { key: "app", group: "account", icon: "Smartphone", href: "/settings?section=app", keywords: ["app", "install", "pwa", "offline", "push", "devices"] },
];

export const GROUP_ORDER: NavGroup[] = ["business", "operations", "channels", "account"];

export function isSectionKey(v: unknown): v is SectionKey {
  return typeof v === "string" && (SECTION_KEYS as readonly string[]).includes(v);
}

/** Old links used #anchors on a single page. */
export const HASH_TO_SECTION: Record<string, SectionKey> = {
  "workspace-modules": "modules",
  "optional-modules": "modules",
  "first-look-settings": "business",
};

/** Active nav key for a URL. */
export function activeKey(pathname: string, section: string | null): string {
  if (pathname.startsWith("/settings/")) return pathname.split("/")[2] ?? "business";
  return isSectionKey(section) ? section : "business";
}
