import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { TaxRuleInput } from '@/lib/tax/rules';

interface SyncOptions {
  dryRun?: boolean;
  approve?: boolean;
}

interface SyncDiff {
  added: TaxRuleInput[];
  updated: Array<{ before: TaxRuleInput; after: TaxRuleInput }>;
  unchanged: TaxRuleInput[];
}

interface SyncReport {
  dryRun: boolean;
  changed: boolean;
  summary: { added: number; updated: number; unchanged: number };
  diff: SyncDiff;
  proposedRules: TaxRuleInput[];
  outputPath: string;
  skippedWriteReason?: string;
}

interface SourceConfig {
  name: string;
  url: string;
  licenseNotes: string;
  fetchRules: () => Promise<Array<Pick<TaxRuleInput, 'countryCode' | 'rate'>>>;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '../..');
const fallbackPath = path.resolve(projectRoot, 'lib/tax/fallback-rates.json');

const VAT_COMPLY_SOURCE: SourceConfig = {
  name: 'VATComply (EU VAT API)',
  url: 'https://api.vatcomply.com/rates',
  licenseNotes:
    'Public free VAT API for reference use. Validate against national authorities before production publication.',
  fetchRules: async () => {
    const response = await fetch('https://api.vatcomply.com/rates');
    if (!response.ok) throw new Error(`VATComply fetch failed (${response.status}).`);

    const payload = (await response.json()) as { rates?: Record<string, number> };
    const rates = payload.rates ?? {};

    return Object.entries(rates)
      .filter(([countryCode, rate]) => /^[A-Z]{2}$/.test(countryCode) && typeof rate === 'number')
      .map(([countryCode, rate]) => ({ countryCode, rate: Number((rate / 100).toFixed(6)) }));
  },
};

const JSON_VAT_SOURCE: SourceConfig = {
  name: 'JSONVAT',
  url: 'https://jsonvat.com/',
  licenseNotes:
    'JSONVAT data is community-maintained. Respect upstream terms and independently verify high-impact changes before approval.',
  fetchRules: async () => {
    const response = await fetch('https://jsonvat.com/');
    if (!response.ok) throw new Error(`JSONVAT fetch failed (${response.status}).`);

    const payload = (await response.json()) as {
      rates?: Array<{ country_code?: string; periods?: Array<{ rates?: { standard?: number } }> }>;
    };

    return (payload.rates ?? [])
      .map((entry) => {
        const countryCode = String(entry.country_code ?? '').toUpperCase();
        const rate = entry.periods?.[0]?.rates?.standard;
        if (!/^[A-Z]{2}$/.test(countryCode) || typeof rate !== 'number') return null;
        return { countryCode, rate: Number((rate / 100).toFixed(6)) };
      })
      .filter((entry): entry is { countryCode: string; rate: number } => Boolean(entry));
  },
};

const APPROVED_FREE_SOURCES: SourceConfig[] = [VAT_COMPLY_SOURCE, JSON_VAT_SOURCE];

async function loadExistingRules(): Promise<TaxRuleInput[]> {
  const raw = await fs.readFile(fallbackPath, 'utf8');
  return JSON.parse(raw) as TaxRuleInput[];
}

function toMap(rules: TaxRuleInput[]) {
  return rules.reduce<Record<string, TaxRuleInput>>((acc, rule) => {
    acc[rule.countryCode.toUpperCase()] = { ...rule, countryCode: rule.countryCode.toUpperCase() };
    return acc;
  }, {});
}

function buildDiff(existing: TaxRuleInput[], nextRules: TaxRuleInput[]): SyncDiff {
  const existingMap = toMap(existing);
  const nextMap = toMap(nextRules);

  const added: TaxRuleInput[] = [];
  const updated: Array<{ before: TaxRuleInput; after: TaxRuleInput }> = [];
  const unchanged: TaxRuleInput[] = [];

  for (const [countryCode, next] of Object.entries(nextMap)) {
    const before = existingMap[countryCode];
    if (!before) {
      added.push(next);
      continue;
    }

    const changed =
      before.rate !== next.rate ||
      before.sourceName !== next.sourceName ||
      before.sourceUrl !== next.sourceUrl ||
      before.licenseNotes !== next.licenseNotes;

    if (changed) {
      updated.push({ before, after: next });
    } else {
      unchanged.push(next);
    }
  }

  return { added, updated, unchanged };
}

export async function syncFallbackRates(options: SyncOptions = {}): Promise<SyncReport> {
  const dryRun = options.dryRun ?? true;
  const approve = options.approve ?? false;
  const existingRules = await loadExistingRules();
  const now = new Date().toISOString();

  const mergedMap = toMap(existingRules);

  for (const source of APPROVED_FREE_SOURCES) {
    try {
      const rules = await source.fetchRules();
      for (const rule of rules) {
        mergedMap[rule.countryCode] = {
          countryCode: rule.countryCode,
          rate: rule.rate,
          sourceName: source.name,
          sourceUrl: source.url,
          fetchedAt: now,
          licenseNotes: source.licenseNotes,
        };
      }
    } catch (error) {
      console.warn(`[tax-sync] Skipping source ${source.name}:`, error);
    }
  }

  const proposedRules = Object.values(mergedMap).sort((a, b) => a.countryCode.localeCompare(b.countryCode));
  const diff = buildDiff(existingRules, proposedRules);
  const changed = diff.added.length > 0 || diff.updated.length > 0;

  let skippedWriteReason: string | undefined;

  if (dryRun) {
    skippedWriteReason = 'dry_run';
  } else if (!approve) {
    skippedWriteReason = 'approval_required';
  } else {
    await fs.writeFile(fallbackPath, `${JSON.stringify(proposedRules, null, 2)}\n`, 'utf8');
  }

  return {
    dryRun,
    changed,
    summary: {
      added: diff.added.length,
      updated: diff.updated.length,
      unchanged: diff.unchanged.length,
    },
    diff,
    proposedRules,
    outputPath: fallbackPath,
    skippedWriteReason,
  };
}

function parseFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function runCli() {
  const dryRun = !parseFlag('--apply');
  const approve = parseFlag('--approve') || process.env.TAX_RULES_SYNC_APPROVED === '1';

  const report = await syncFallbackRates({ dryRun, approve });
  console.log(JSON.stringify(report, null, 2));

  if (!dryRun && report.skippedWriteReason === 'approval_required') {
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    console.error('[tax-sync] Fatal error:', error);
    process.exit(1);
  });
}
