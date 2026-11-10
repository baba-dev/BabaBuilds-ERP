/** Categories offered on the form. Other values already in a workspace (PO restock, imports, custom) are kept and offered too. */
export const PRESET_CATEGORIES = [
  { value: "Hosting & Cloud", key: "hosting" },
  { value: "Software Subscriptions", key: "software" },
  { value: "Hardware & Equipment", key: "hardware" },
  { value: "Internet & Utilities", key: "internet" },
  { value: "Sub-contractors", key: "contractors" },
  { value: "Office & Rent", key: "office" },
  { value: "Meals & Entertainment", key: "meals" },
  { value: "Other", key: "other" },
] as const;

export const CATEGORY_KEY: Record<string, string> = Object.fromEntries(PRESET_CATEGORIES.map((c) => [c.value, c.key]));
export const MAX_CATEGORY_LENGTH = 60;
