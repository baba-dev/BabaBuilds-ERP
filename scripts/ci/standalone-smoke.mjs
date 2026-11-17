#!/usr/bin/env node
/**
 * Node 26 production-mode standalone smoke. CI only: requires a disposable
 * PostgreSQL 17 DATABASE_URL and a completed "next build".
 *
 * Launches .next/standalone/server.js (never next dev), with no production
 * credentials, external auth, payment or SMTP side effects.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, cp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const standalone = path.join(root, ".next/standalone");
const testDbName = "bababuilds_erp_ci";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function assertDisposableDatabase() {
  const raw = process.env.DATABASE_URL;
  assert.ok(raw, "DATABASE_URL is required");
  const url = new URL(raw);
  assert.ok(["postgresql:", "postgres:"].includes(url.protocol), "PostgreSQL only");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Only local isolated database allowed");
  assert.equal(decodeURIComponent(url.pathname.slice(1)), testDbName, "Only disposable CI database allowed");
}

async function availablePort() {
  const s = createServer();
  await new Promise((resolve, reject) => { s.once("error", reject); s.listen(0, "127.0.0.1", resolve); });
  const port = s.address().port;
  await new Promise((resolve, reject) => s.close(err => err ? reject(err) : resolve()));
  return port;
}

async function findStaticFile(dir, prefix = "") {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      const found = await findStaticFile(path.join(dir, entry.name), relative);
      if (found) return found;
    } else if (/\.(?:js|css)$/.test(entry.name)) {
      return relative;
    }
  }
  return null;
}

async function nativeChecks() {
  const { default: sharp } = await import("sharp");
  const { PDFDocument } = await import("pdf-lib");
  const { PDFParse } = await import("pdf-parse");
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");

  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#eef2ff" } }).png().toBuffer();
  const image = await sharp(png).resize(16, 16).webp().toBuffer();
  assert.equal((await sharp(image).metadata()).width, 16, "Sharp native image processing");

  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]).drawText("Node26 PDF check");
  const bytes = await pdf.save();
  assert.ok(bytes.length > 100);
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    assert.match(result.text, /Node26 PDF check/, "PDF parser");
  } finally {
    await parser.destroy();
  }

  const db = new PrismaClient({ adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
  }) });
  try {
    const rows = await db.$queryRaw`SELECT 1 AS ok`;
    assert.equal(Number(rows[0].ok), 1);
    const transaction = await db.$transaction(async tx => tx.$queryRaw`SELECT 2 AS ok`);
    assert.equal(Number(transaction[0].ok), 2, "PostgreSQL transaction");
  } finally {
    await db.$disconnect();
  }
  return png;
}

async function get(base, route, expectedStatus = 200) {
  const response = await fetch(base + route, { redirect: "manual", signal: AbortSignal.timeout(10000), headers: { "Cache-Control": "no-cache" } });
  assert.equal(response.status, expectedStatus, route + " HTTP " + response.status);
  return response;
}

async function main() {
  assert.equal(process.version, "v26.13.1", "Run using pinned Node 26.13.1");
  assertDisposableDatabase();
  await stat(path.join(standalone, "server.js"));
  await stat(path.join(root, ".next/static"));
  const sourcePublic = path.join(root, "public");
  const png = await nativeChecks();

  const temp = await mkdtemp(path.join(tmpdir(), "erp-node26-standalone-"));
  let child;
  let log = "";
  try {
    await cp(standalone, temp, { recursive: true, force: true });
    await cp(path.join(root, ".next/static"), path.join(temp, ".next/static"), { recursive: true, force: true });
    await cp(sourcePublic, path.join(temp, "public"), { recursive: true, force: true });
    await writeFile(path.join(temp, "public/__node26_smoke.png"), png);
    const staticFile = await findStaticFile(path.join(temp, ".next/static"));
    assert.ok(staticFile, "Missing JS/CSS standalone static asset");

    const port = await availablePort();
    const base = "http://127.0.0.1:" + port;
    child = spawn(process.execPath, [path.join(temp, "server.js")], {
      cwd: temp, stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1",
        NEXTAUTH_URL: base, NEXTAUTH_SECRET: "node26-test-only-secret-00000000000000000",
        AUTH_GOOGLE_ENABLED: "false", AUTH_EMAIL_ENABLED: "false",
        ERP_STAGING_MODE: "0", NEXT_TELEMETRY_DISABLED: "1",
        CRON_SECRET: "node26-test-only-unauthorized-cron-secret"
      }
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", bytes => { log = (log + bytes.toString()).slice(-6000); });
    }

    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (child.exitCode !== null) break;
      try {
        const probe = await fetch(base + "/login", { signal: AbortSignal.timeout(1500) });
        if (probe.status < 500) { ready = true; break; }
      } catch { /* Startup in progress. */ }
      await sleep(500);
    }
    assert.ok(ready, "Standalone server did not become healthy: " + log);

    const login = await get(base, "/login");
    assert.match(login.headers.get("content-type") || "", /text\/html/);
    const asset = await get(base, "/_next/static/" + staticFile.split("/").map(encodeURIComponent).join("/"));
    assert.ok((await asset.arrayBuffer()).byteLength > 0, "Static bundle must not be empty");

    const image = await get(base, "/__node26_smoke.png");
    assert.match(image.headers.get("content-type") || "", /image\/png/);
    const optimized = await get(base, "/_next/image?url=%2F__node26_smoke.png&w=64&q=75");
    assert.match(optimized.headers.get("content-type") || "", /image\//, "Next image optimizer");
    assert.ok((await optimized.arrayBuffer()).byteLength > 0);

    const swFile = await stat(path.join(temp, "public/sw.js")).catch(() => null);
    assert.ok(swFile?.size, "Production service worker was not generated");
    const sw = await get(base, "/sw.js");
    assert.match(sw.headers.get("content-type") || "", /javascript/);
    assert.match(sw.headers.get("cache-control") || "", /no-store/);

    const session = await get(base, "/api/auth/session");
    assert.match(session.headers.get("content-type") || "", /json/);
    await session.json();

    const unauthorizedUpload = await fetch(base + "/api/inbox/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareId: "invalid-test-only" }), signal: AbortSignal.timeout(10000)
    });
    assert.ok([400, 401, 403, 422].includes(unauthorizedUpload.status), "Upload validation must reject invalid requests");

    console.log("STANDALONE_NODE26_SMOKE_PASS: native images, PDF, Prisma transaction, packaged server, static assets, image optimizer, service worker, auth session and upload rejection");
  } catch (error) {
    console.error(String(error));
    if (log) console.error("Standalone logs (last 6k):\n" + log.replace(/(DATABASE_URL|NEXTAUTH_SECRET|CRON_SECRET)=[^\s]+/g, "$1=[REDACTED]"));
    process.exitCode = 1;
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([new Promise(resolve => child.once("exit", resolve)), sleep(5000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    await rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
