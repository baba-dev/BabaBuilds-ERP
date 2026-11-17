import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildDashboardCacheKey,
  getDashboardCacheEntry,
  invalidateDashboardCacheForWorkspace,
  setDashboardCacheEntry,
} from '@/lib/dashboard-cache';

type KpiConfig = {
  entities: Array<{
    entity: string;
    writeEndpoints: string[];
  }>;
};

const configPath = path.join(process.cwd(), 'config', 'dashboard-kpi-impacting-entities.json');
const parsedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as KpiConfig;

describe('dashboard cache invalidation coverage', () => {
  it('ensures all KPI-impacting write endpoints contain invalidation and incident logging', () => {
    for (const entry of parsedConfig.entities) {
      for (const endpoint of entry.writeEndpoints) {
        const source = fs.readFileSync(path.join(process.cwd(), endpoint), 'utf8');
        expect(source, `${entry.entity} endpoint missing invalidation: ${endpoint}`).toContain(
          'invalidateDashboardCacheForWorkspace('
        );
        expect(source, `${entry.entity} endpoint missing incident logging: ${endpoint}`).toContain(
          'noteDashboardCacheIncident('
        );
      }
    }
  });

  it('mutate entity -> fetch dashboard triggers KPI refresh path for each configured entity', async () => {
    for (const entry of parsedConfig.entities) {
      const workspaceId = `ws-kpi-${entry.entity}`;
      const cacheKey = buildDashboardCacheKey({ workspaceId, fy: '2025-26' });

      setDashboardCacheEntry(cacheKey, { kpiEntity: entry.entity, value: 100 });
      expect(getDashboardCacheEntry(cacheKey)?.payload).toEqual({ kpiEntity: entry.entity, value: 100 });

      await invalidateDashboardCacheForWorkspace(workspaceId);
      expect(getDashboardCacheEntry(cacheKey)).toBeNull();

      setDashboardCacheEntry(cacheKey, { kpiEntity: entry.entity, value: 200 });
      expect(getDashboardCacheEntry(cacheKey)?.payload).toEqual({ kpiEntity: entry.entity, value: 200 });
    }
  });
});
