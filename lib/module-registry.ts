import { MODULE_KEYS, type ModuleKey } from "@/lib/module-keys";

export type ModuleGroup = "finance" | "sales" | "people" | "compliance" | "data";

export type ModuleMeta = {
  key: ModuleKey;
  group: ModuleGroup;
  /** lucide icon name, resolved on the client. */
  icon: string;
  /** Where the module lives once it is on. Must be a real page (a test checks). */
  href: string;
  /** Modules that work better together. Advice, not a hard requirement. */
  suggests: ModuleKey[];
  /** On for a paid workspace until someone turns it off. */
  defaultOn: boolean;
  /** Shown in Settings > Modules. SHOP is switched in Online shop instead. */
  inSettings: boolean;
  /** Another settings section that explains or configures it. */
  configureIn?: string;
};

/**
 * The one list of optional modules. The menu, the dashboard cards, Settings and the "module is off" page read from here,
 * so a new module or a moved page is one edit. Names and descriptions are in messages (SettingsHub.modules.items).
 */
export const MODULE_REGISTRY: readonly ModuleMeta[] = [
  { key: "CASH_FLOW", group: "finance", icon: "Waves", href: "/cash-flow", suggests: ["AR_COLLECTIONS"], defaultOn: false, inSettings: true },
  { key: "AR_COLLECTIONS", group: "finance", icon: "Siren", href: "/ar-collections", suggests: ["CASH_FLOW"], defaultOn: false, inSettings: true, configureIn: "email" },
  { key: "REVENUE_PIPELINE", group: "sales", icon: "Target", href: "/proposals/pipeline", suggests: [], defaultOn: false, inSettings: true },
  { key: "POS", group: "sales", icon: "ShoppingCart", href: "/pos", suggests: [], defaultOn: true, inSettings: true },
  { key: "SHOP", group: "sales", icon: "Store", href: "/shop", suggests: ["POS"], defaultOn: true, inSettings: false, configureIn: "shop" },
  { key: "WORKFORCE", group: "people", icon: "Users2", href: "/workforce", suggests: [], defaultOn: false, inSettings: true },
  { key: "PAYROLL", group: "people", icon: "HandCoins", href: "/payroll", suggests: ["WORKFORCE"], defaultOn: false, inSettings: true },
  { key: "DOCUMENTS", group: "compliance", icon: "FileText", href: "/documents", suggests: [], defaultOn: false, inSettings: true },
  { key: "REPORTING_CENTER", group: "compliance", icon: "ChartColumnBig", href: "/reporting", suggests: [], defaultOn: false, inSettings: true },
  { key: "TAX_ADVANCED", group: "compliance", icon: "ShieldCheck", href: "/tax/income-tax", suggests: ["DOCUMENTS"], defaultOn: false, inSettings: true },
  { key: "MULTI_COMPANY", group: "data", icon: "Building2", href: "/companies", suggests: [], defaultOn: false, inSettings: true },
  { key: "IMPORT_MANAGER", group: "data", icon: "UploadCloud", href: "/import-manager", suggests: [], defaultOn: false, inSettings: true },
  { key: "MIAB_BILLING", group: "data", icon: "Mailbox", href: "/email-billing", suggests: [], defaultOn: false, inSettings: true },
];

export const MODULE_GROUP_ORDER: ModuleGroup[] = ["finance", "sales", "people", "compliance", "data"];

const BY_KEY = new Map(MODULE_REGISTRY.map((m) => [m.key, m]));
export const moduleMeta = (key: ModuleKey): ModuleMeta => BY_KEY.get(key) as ModuleMeta;
export const moduleHref = (key: string): string => BY_KEY.get(key as ModuleKey)?.href ?? "/settings?section=modules";
export const registryKeys = (): ModuleKey[] => MODULE_REGISTRY.map((m) => m.key);
export const allModuleKeys = (): readonly ModuleKey[] => MODULE_KEYS;
