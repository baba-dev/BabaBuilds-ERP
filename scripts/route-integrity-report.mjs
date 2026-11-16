#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const appDir = path.join(workspaceRoot, 'app');
const sourceRoots = [
  path.join(workspaceRoot, 'app'),
  path.join(workspaceRoot, 'components'),
  path.join(workspaceRoot, 'content'),
];
const outputDir = path.join(workspaceRoot, 'docs', 'reports');
const outputPath = path.join(outputDir, 'route-integrity-report.json');

const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mdx']);
const ROUTE_LITERAL_REGEX = /(['"`])(\/[A-Za-z0-9\-_/[\].?=&%#]*)\1/g;
const STATIC_ASSET_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.ico',
  '.css',
  '.js',
  '.json',
  '.pdf',
  '.txt',
  '.xml',
  '.webmanifest',
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
      files.push(...walk(fullPath));
      continue;
    }
    if (entry.isFile() && SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function isApiSegment(segments) {
  return segments[0] === 'api';
}

// Source paths declared in next.config.ts redirects()/rewrites() are valid link targets.
function listConfiguredRedirects() {
  const configPath = path.join(workspaceRoot, 'next.config.ts');
  if (!fs.existsSync(configPath)) return new Set();
  const content = fs.readFileSync(configPath, 'utf8');
  const sources = new Set();
  for (const match of content.matchAll(/source:\s*['"`](\/[^'"`:*()]*)['"`]/g)) {
    sources.add(normalizeRoute(match[1]));
  }
  return sources;
}

// Files whose path literals are not navigation links (crawler rules, framework error shells).
const NON_LINK_FILES = new Set(['app/robots.ts', 'app/global-error.tsx']);

function listAppRoutes() {
  const routes = new Set();
  const routePatterns = [];

  function walkApp(dir, segments = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    // A path is navigable when it has a page or a route handler (e.g. /signup is a redirecting route.ts).
    const hasPage = entries.some(
      (e) => e.isFile() && (e.name === 'page.tsx' || e.name === 'route.ts') && !isApiSegment(segments),
    );
    if (hasPage) {
      const routeSegments = segments.filter((seg) => !seg.startsWith('('));
      const route = `/${routeSegments.join('/')}`.replace(/\/+/g, '/');
      const normalized = route === '/' ? '/' : route.replace(/\/$/, '');
      routes.add(normalized);
      const regex = new RegExp(
        `^${normalized
          .split('/')
          .map((part) => {
            if (!part) return '';
            if (part.startsWith('[') && part.endsWith(']')) return '[^/]+';
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .join('/')}$`,
      );
      routePatterns.push({ route: normalized, regex });
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      walkApp(path.join(dir, entry.name), [...segments, entry.name]);
    }
  }

  walkApp(appDir, []);
  return { routes, routePatterns };
}

function normalizeRoute(route) {
  const withoutHash = route.split('#')[0];
  const withoutQuery = withoutHash.split('?')[0];
  return withoutQuery === '/' ? '/' : withoutQuery.replace(/\/$/, '');
}

function shouldIgnoreRoute(route) {
  if (!route.startsWith('/')) return true;
  if (route.startsWith('/api/')) return true;
  // Absolute Linux filesystem paths are not browser navigation targets.
  // Keep unknown web paths in scope: only known OS filesystem roots are excluded.
  if (/^\/(?:var|etc|opt|usr|proc|sys|dev|run|tmp|home)\//.test(route)) return true;
  if (route.startsWith('/_')) return true; // framework-internal paths
  if (route.startsWith('/_next/')) return true;
  if (route.includes('[') || route.includes(']')) return true;
  if (route === '/auth/signin' || route === '/signin/email') return true; // NextAuth internal pages
  if (route === '/manifest.webmanifest' || route === '/sw.js') return true; // framework artifacts
  if (route === '/share-target') return true; // PWA share target action endpoint
  if (route.startsWith('/uploads/')) return true; // storage-backed paths resolved by route handlers
  if (route.startsWith('/logos/')) return true;
  if (route.startsWith('/products/')) return true;
  if (route.startsWith('/invoices/')) return true;
  if (route.startsWith('/receipts/')) return true;
  if (route.startsWith('/signatures/')) return true;
  if (route.startsWith('/documents/')) return false; // keep dashboard document pages in scope
  const ext = path.extname(route).toLowerCase();
  if (STATIC_ASSET_EXTENSIONS.has(ext)) return true;
  return false;
}

function collectRouteReferences(files) {
  const usage = new Map();
  for (const file of files) {
    if (NON_LINK_FILES.has(path.relative(workspaceRoot, file).split(path.sep).join('/'))) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(ROUTE_LITERAL_REGEX)) {
      const rawRoute = match[2];
      if (shouldIgnoreRoute(rawRoute)) continue;
      const route = normalizeRoute(rawRoute);
      const existing = usage.get(route) ?? [];
      existing.push(path.relative(workspaceRoot, file));
      usage.set(route, existing);
    }
  }
  return usage;
}

function matchesKnownRoute(route, knownRoutes, routePatterns) {
  if (knownRoutes.has(route)) return true;
  return routePatterns.some((p) => p.regex.test(route));
}

function dedupe(arr) {
  return [...new Set(arr)];
}

function buildReport() {
  const sourceFiles = sourceRoots.flatMap((root) => walk(root));
  const { routes: knownRoutes, routePatterns } = listAppRoutes();
  for (const redirectSource of listConfiguredRedirects()) knownRoutes.add(redirectSource);
  const usage = collectRouteReferences(sourceFiles);

  const checkedRoutes = [];
  const brokenRoutes = [];
  for (const [route, files] of usage.entries()) {
    const exists = matchesKnownRoute(route, knownRoutes, routePatterns);
    const entry = {
      route,
      exists,
      references: dedupe(files).sort(),
    };
    checkedRoutes.push(entry);
    if (!exists) brokenRoutes.push(entry);
  }

  checkedRoutes.sort((a, b) => a.route.localeCompare(b.route));
  brokenRoutes.sort((a, b) => a.route.localeCompare(b.route));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      knownRoutes: knownRoutes.size,
      checkedReferencedRoutes: checkedRoutes.length,
      brokenReferencedRoutes: brokenRoutes.length,
    },
    gate: {
      pass: brokenRoutes.length === 0,
      criteria: 'No broken internal page routes referenced by source files in app/components/content.',
    },
    brokenRoutes,
    checkedRoutes,
  };
}

function main() {
  if (!fs.existsSync(appDir)) {
    throw new Error(`Expected app directory at ${appDir}`);
  }
  const report = buildReport();
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${outputPath}`);
  console.log(
    `Known routes: ${report.summary.knownRoutes} | Checked references: ${report.summary.checkedReferencedRoutes} | Broken: ${report.summary.brokenReferencedRoutes}`,
  );

  if (report.summary.brokenReferencedRoutes > 0) {
    process.exitCode = 1;
  }
}

main();
