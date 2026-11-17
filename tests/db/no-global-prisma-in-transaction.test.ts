import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The PostgreSQL pool is small and bounded (ERP_PG_POOL_MAX). An interactive transaction holds one
 * connection for its whole callback; calling the global `prisma` client (or a helper that uses it)
 * from inside makes the request wait for a *second* connection. With enough concurrent requests every
 * connection is held by a transaction waiting for another one: the pool deadlocks until the connect
 * timeout and every request fails. Always read and write through the transaction client (`tx`).
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === ".next") return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

function transactionBodies(src: string): Array<{ body: string; line: number }> {
  const out: Array<{ body: string; line: number }> = [];
  const re = /\$transaction\(\s*(?:async\s*)?\(?\s*(\w+)?\s*\)?\s*=>\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = re.lastIndex;
    let depth = 1;
    while (i < src.length && depth) {
      const c = src[i++];
      if (c === "{") depth++;
      else if (c === "}") depth--;
    }
    out.push({ body: src.slice(re.lastIndex, i), line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

const files = [...sourceFiles("lib"), ...sourceFiles("app")];

describe("interactive transactions use only their own connection", () => {
  it("never reference the global prisma client inside a $transaction callback", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const { body, line } of transactionBodies(src)) {
        for (const hit of body.matchAll(/(^|[^\w.])prisma\.(\$?\w+)/g)) {
          offenders.push(`${file}:${line + body.slice(0, hit.index).split("\n").length - 1} prisma.${hit[2]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never await a global-client helper without handing it `tx`", () => {
    // Every exported function in a module that imports the global client. Inside a transaction it
    // must be handed `tx` (helpers that default to the global client are the trap).
    const globalClientHelpers = new Map<string, string>();
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!/from ['"]@\/lib\/prisma['"]/.test(src)) continue;
      for (const m of src.matchAll(/export (?:async )?function (\w+)\s*\(([^)]*)\)/g)) {
        globalClientHelpers.set(m[1], file);
      }
    }
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const { body, line } of transactionBodies(src)) {
        for (const call of body.matchAll(/await\s+(\w+)\(([^)]*)\)/g)) {
          if (globalClientHelpers.has(call[1]) && !/\btx\b/.test(call[2])) {
            offenders.push(`${file}:${line + body.slice(0, call.index).split("\n").length - 1} ${call[1]}() from ${globalClientHelpers.get(call[1])}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
