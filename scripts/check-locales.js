#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const messagesDir = path.join(process.cwd(), 'messages');
const baseLocale = 'en-IN.json';

function flattenKeys(value, prefix = '', keys = []) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      const nextPrefix = prefix ? `${prefix}.${k}` : k;
      flattenKeys(v, nextPrefix, keys);
    }
    return keys;
  }

  keys.push(prefix);
  return keys;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  if (!fs.existsSync(messagesDir)) {
    console.error(`❌ messages directory not found at: ${messagesDir}`);
    process.exit(1);
  }

  const localeFiles = fs
    .readdirSync(messagesDir)
    .filter((file) => file.endsWith('.json'))
    .sort();

  if (!localeFiles.includes(baseLocale)) {
    console.error(`❌ Base locale file \"${baseLocale}\" was not found in messages/.`);
    process.exit(1);
  }

  const basePath = path.join(messagesDir, baseLocale);
  const baseJson = readJson(basePath);
  const baseKeys = new Set(flattenKeys(baseJson));

  let hasErrors = false;

  for (const localeFile of localeFiles) {
    if (localeFile === baseLocale) {
      continue;
    }

    const localePath = path.join(messagesDir, localeFile);
    const localeJson = readJson(localePath);
    const localeKeys = new Set(flattenKeys(localeJson));

    const missingKeys = [...baseKeys].filter((key) => !localeKeys.has(key));

    if (missingKeys.length > 0) {
      hasErrors = true;
      console.error(`\n❌ ${localeFile} is missing ${missingKeys.length} key(s):`);
      for (const key of missingKeys) {
        console.error(`   - ${key}`);
      }
    } else {
      console.log(`✅ ${localeFile} includes all keys from ${baseLocale}`);
    }
  }

  if (hasErrors) {
    console.error('\nLocalization QA failed: one or more locale files are missing keys.');
    process.exit(1);
  }

  console.log('\nLocalization QA passed: all locale files include base keys.');
}

main();
