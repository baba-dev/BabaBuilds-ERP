import { MODULE_KEYS, type ModuleKey } from '@/lib/modules';

export const DEMO_REQUIRED_MODULES: readonly ModuleKey[] = MODULE_KEYS;

export function getMissingRequiredModules(enabledModules: readonly ModuleKey[]): ModuleKey[] {
  const enabledSet = new Set(enabledModules);
  return DEMO_REQUIRED_MODULES.filter((moduleKey) => !enabledSet.has(moduleKey));
}
