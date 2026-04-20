#!/usr/bin/env node

import { MODULE_KEYS } from '@/lib/module-keys';
import { getDemoTemplates } from '@/lib/demo/templates';
import { getMissingRequiredModules } from '@/lib/demo/templates/coverage-rules';

function main() {
  const failures: string[] = [];
  const templates = getDemoTemplates();
  const knownModuleKeys = new Set(MODULE_KEYS);

  for (const template of templates) {
    const enabledModules = MODULE_KEYS.filter((moduleKey) => Boolean(template.modules[moduleKey]));
    const missingRequiredModules = getMissingRequiredModules(enabledModules);
    if (missingRequiredModules.length > 0) {
      failures.push(
        `${template.key}: missing required module enablement: ${missingRequiredModules.join(', ')}`,
      );
    }

    const seededSet = new Set(template.seededModules);
    const missingSeededCoverage = enabledModules.filter((moduleKey) => !seededSet.has(moduleKey));
    if (missingSeededCoverage.length > 0) {
      failures.push(
        `${template.key}: enabled modules missing seeded showcase coverage: ${missingSeededCoverage.join(', ')}`,
      );
    }

    for (const seededModule of seededSet) {
      if (!knownModuleKeys.has(seededModule)) {
        failures.push(`${template.key}: seededModules contains unknown module key ${seededModule}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('Demo template coverage validation failed:');
    for (const failure of failures) {
      console.error(` - ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Demo template coverage validation passed for ${templates.length} templates.`);
}

main();
