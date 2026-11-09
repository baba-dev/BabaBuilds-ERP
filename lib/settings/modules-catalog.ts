import { MODULE_GROUP_ORDER, MODULE_REGISTRY, type ModuleGroup, type ModuleMeta } from "@/lib/module-registry";

export type { ModuleGroup };
export type ModuleEntry = ModuleMeta;

/** Modules switched from Settings > Modules, from the shared registry. */
export const MODULE_CATALOG: ModuleEntry[] = MODULE_REGISTRY.filter((m) => m.inSettings);
export { MODULE_GROUP_ORDER };
