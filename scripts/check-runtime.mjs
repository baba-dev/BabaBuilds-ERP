#!/usr/bin/env node
/**
 * Fast guard for local/agent runs (`predev`, `pretest`, `ci:fast`): is this machine actually running
 * the runtime the repository is pinned to?
 *
 *  - Node major differs from .nvmrc      -> WARNING (the existing Node 22 production release must keep
 *                                           working, so this never blocks by itself; `--strict` blocks).
 *  - node_modules is stale or incomplete -> ERROR. Running against Prisma 6 / a missing `pg` adapter /
 *                                           missing `ioredis` fails in confusing ways, so say so up front.
 *
 * Fix for both: `nvm use && npm ci --no-audit --no-fund`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Packages whose version skew breaks the PostgreSQL/Redis integration in non-obvious ways. */
export const GUARDED_PACKAGES = ["prisma", "@prisma/client", "@prisma/adapter-pg", "ioredis", "next"];

const major = (v) => Number(String(v).replace(/^[^\d]*/, "").split(".")[0]);

/** Exact pins must match exactly; ranges (^, ~, >=) must match on major version. */
export function satisfies(installed, spec) {
  if (!installed) return false;
  const s = String(spec).trim();
  if (/^\d+\.\d+\.\d+/.test(s)) return installed === s;
  return major(installed) === major(s);
}

export function evaluateRuntime({ nodeVersion, expectedNode, pkg, installed, strict = false }) {
  const errors = [];
  const warnings = [];
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };

  if (expectedNode && major(nodeVersion) !== major(expectedNode)) {
    const message = `Node ${nodeVersion} is running but .nvmrc pins ${expectedNode} (run \`nvm use\`).`;
    (strict ? errors : warnings).push(message);
  }
  for (const name of GUARDED_PACKAGES) {
    const spec = declared[name];
    if (!spec) continue;
    const have = installed[name];
    if (!have) errors.push(`${name} is declared (${spec}) but not installed.`);
    else if (!satisfies(have, spec)) errors.push(`${name} ${have} is installed but package.json wants ${spec}.`);
  }
  return { errors, warnings };
}

function readInstalled(root) {
  const out = {};
  for (const name of GUARDED_PACKAGES) {
    const file = path.join(root, "node_modules", ...name.split("/"), "package.json");
    if (existsSync(file)) out[name] = JSON.parse(readFileSync(file, "utf8")).version;
  }
  return out;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const nvmrc = path.join(root, ".nvmrc");
  const expectedNode = existsSync(nvmrc) ? readFileSync(nvmrc, "utf8").trim() : null;
  const { errors, warnings } = evaluateRuntime({
    nodeVersion: process.versions.node,
    expectedNode,
    pkg,
    installed: readInstalled(root),
    strict: process.argv.includes("--strict"),
  });
  for (const w of warnings) console.warn(`[runtime] warning: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[runtime] error: ${e}`);
    console.error("[runtime] Reinstall with the pinned toolchain: nvm use && npm ci --no-audit --no-fund");
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
