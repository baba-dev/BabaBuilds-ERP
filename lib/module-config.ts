import { z } from "zod";
import type { ModuleKey } from "@/lib/module-keys";

/**
 * Per-module options kept in WorkspaceModule.configJson. Only the options listed here can be set from the settings
 * screen; anything else in the JSON (for example a module's own run state) is preserved untouched.
 */
export const MODULE_OPTION_SCHEMAS = {
  AR_COLLECTIONS: z.object({
    /** Send overdue-invoice reminders every day without anyone pressing the button. Off until someone opts in. */
    autoReminders: z.boolean(),
  }),
} as const satisfies Partial<Record<ModuleKey, z.ZodTypeAny>>;

export type ConfigurableModule = keyof typeof MODULE_OPTION_SCHEMAS;

export const isConfigurableModule = (key: string): key is ConfigurableModule => key in MODULE_OPTION_SCHEMAS;

export function mergeModuleConfig(existing: unknown, options: Record<string, unknown>): Record<string, unknown> {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  return { ...base, ...options };
}
