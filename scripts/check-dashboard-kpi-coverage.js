#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const configPath = path.join(process.cwd(), 'config', 'dashboard-kpi-impacting-entities.json');

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function main() {
  if (!fs.existsSync(configPath)) {
    console.error(`❌ KPI impact config missing: ${configPath}`);
    process.exit(1);
  }

  const parsed = JSON.parse(readUtf8(configPath));
  const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
  if (entities.length === 0) {
    console.error('❌ KPI impact config has no entities.');
    process.exit(1);
  }

  const failures = [];
  for (const item of entities) {
    const writeEndpoints = Array.isArray(item.writeEndpoints) ? item.writeEndpoints : [];
    for (const endpoint of writeEndpoints) {
      const endpointPath = path.join(process.cwd(), endpoint);
      if (!fs.existsSync(endpointPath)) {
        failures.push(`${item.entity}: missing endpoint file ${endpoint}`);
        continue;
      }

      const source = readUtf8(endpointPath);
      if (!source.includes('invalidateDashboardCacheForWorkspace(')) {
        failures.push(`${item.entity}: no invalidateDashboardCacheForWorkspace call in ${endpoint}`);
      }
      if (!source.includes('noteDashboardCacheIncident(')) {
        failures.push(`${item.entity}: no noteDashboardCacheIncident call in ${endpoint}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('❌ Dashboard KPI cache coverage check failed:');
    for (const failure of failures) {
      console.error(`   - ${failure}`);
    }
    process.exit(1);
  }

  console.log(`✅ Dashboard KPI cache coverage check passed for ${entities.length} entities.`);
}

main();
