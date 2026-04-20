#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const MODULE_KEYS = [
  'WORKFORCE',
  'PAYROLL',
  'DOCUMENTS',
  'REVENUE_PIPELINE',
  'CASH_FLOW',
  'AR_COLLECTIONS',
  'TAX_ADVANCED',
  'REPORTING_CENTER',
  'IMPORT_MANAGER',
];

const TEMPLATE_FILES = [
  'lib/demo/templates/dm-agency.ts',
  'lib/demo/templates/software-company.ts',
  'lib/demo/templates/tax-agency.ts',
];

function extractObjectBlock(source, keyName) {
  const startKey = `${keyName}:`;
  const startIndex = source.indexOf(startKey);
  if (startIndex < 0) return null;

  const braceStart = source.indexOf('{', startIndex);
  if (braceStart < 0) return null;

  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, i);
      }
    }
  }
  return null;
}

function extractArrayBlock(source, keyName) {
  const startKey = `${keyName}:`;
  const startIndex = source.indexOf(startKey);
  if (startIndex < 0) return null;

  const bracketStart = source.indexOf('[', startIndex);
  if (bracketStart < 0) return null;

  let depth = 0;
  for (let i = bracketStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bracketStart + 1, i);
      }
    }
  }
  return null;
}

function parseEnabledModules(modulesBlock) {
  const enabled = new Set();
  const re = /([A-Z_]+)\s*:\s*true/g;
  let m;
  while ((m = re.exec(modulesBlock)) !== null) {
    enabled.add(m[1]);
  }
  return enabled;
}

function parseSeededModules(arrayBlock) {
  const seeded = new Set();
  const re = /['\"]([A-Z_]+)['\"]/g;
  let m;
  while ((m = re.exec(arrayBlock)) !== null) {
    seeded.add(m[1]);
  }
  return seeded;
}

function main() {
  const failures = [];

  for (const relativeFile of TEMPLATE_FILES) {
    const absoluteFile = path.join(ROOT, relativeFile);
    if (!fs.existsSync(absoluteFile)) {
      failures.push(`${relativeFile}: template file missing`);
      continue;
    }

    const source = fs.readFileSync(absoluteFile, 'utf8');
    const modulesBlock = extractObjectBlock(source, 'modules');
    const seededBlock = extractArrayBlock(source, 'seededModules');

    if (!modulesBlock) {
      failures.push(`${relativeFile}: missing modules declaration`);
      continue;
    }
    if (!seededBlock) {
      failures.push(`${relativeFile}: missing seededModules declaration`);
      continue;
    }

    const enabledModules = parseEnabledModules(modulesBlock);
    const seededModules = parseSeededModules(seededBlock);

    for (const moduleKey of MODULE_KEYS) {
      if (!enabledModules.has(moduleKey)) {
        failures.push(`${relativeFile}: module ${moduleKey} is not enabled`);
      }
    }

    for (const moduleKey of MODULE_KEYS) {
      if (!seededModules.has(moduleKey)) {
        failures.push(`${relativeFile}: missing seededModules coverage for ${moduleKey}`);
      }
    }

    for (const moduleKey of seededModules) {
      if (!MODULE_KEYS.includes(moduleKey)) {
        failures.push(`${relativeFile}: seededModules contains unknown module key ${moduleKey}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('❌ Demo template coverage validation failed:');
    for (const failure of failures) {
      console.error(`   - ${failure}`);
    }
    process.exit(1);
  }

  console.log(`✅ Demo template coverage validation passed for ${TEMPLATE_FILES.length} templates.`);
}

main();
