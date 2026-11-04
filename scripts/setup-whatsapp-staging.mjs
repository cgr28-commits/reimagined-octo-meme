#!/usr/bin/env node
/**
 * Create isolated KV + deploy the Meta WhatsApp staging Worker.
 *
 * Usage (from repo root) — Meta TEST credentials only:
 *   CLOUDFLARE_API_TOKEN=... \
 *   WHATSAPP_ACCESS_TOKEN=... \
 *   WHATSAPP_PHONE_NUMBER_ID=... \
 *   WHATSAPP_APP_SECRET=... \
 *   WHATSAPP_VERIFY_TOKEN=... \
 *   WHATSAPP_BUSINESS_ACCOUNT_ID=... \
 *   node scripts/setup-whatsapp-staging.mjs
 *
 * Optional: ANTHROPIC_API_KEY (only if testing AI on staging)
 *
 * Hard refusals:
 * - Will not read or copy production Worker secrets
 * - Will not set D360_API_KEY on staging
 * - Will not bind production KV namespace IDs
 * - Will not touch wrangler.toml (production)
 */

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;
const workerDir = join(repoRoot, "workers/addresses");
const stagingPath = join(workerDir, "wrangler.staging.toml");
const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
  process.env.CF_ACCOUNT_ID?.trim() ||
  "36c5c88df4c1f0259413d555f2679f3c";
const token =
  process.env.CLOUDFLARE_API_TOKEN?.trim() || process.env.CF_API_TOKEN?.trim();

const REQUIRED_META = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
];

// Exact production KV ids from workers/addresses/wrangler.toml — never bind these to staging.
const FORBIDDEN_KV = new Set([
  "53fa3cc2bd46436f90ae19200e599ea1", // production TRACKING_STORE
  "869e2c2e02004d4a88c9cfbf563f1d6a", // production BOOKING_COUNTER
]);

function die(msg) {
  console.error(`\nERROR: ${msg}`);
  process.exit(1);
}

function run(command, options = {}) {
  console.log(`\n→ ${command}`);
  execSync(command, {
    stdio: "inherit",
    cwd: options.cwd ?? workerDir,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token },
  });
}

function runCapture(command) {
  return execSync(command, {
    encoding: "utf8",
    cwd: workerDir,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token },
  }).trim();
}

function putSecret(name, value) {
  console.log(`  set ${name} on staging Worker`);
  const result = spawnSync(
    "npx",
    ["wrangler", "secret", "put", name, "--config", "wrangler.staging.toml"],
    {
      input: value.trim(),
      cwd: workerDir,
      stdio: ["pipe", "inherit", "inherit"],
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token },
    },
  );
  if (result.status !== 0) die(`Failed to set staging secret ${name}`);
}

function createKv(title) {
  console.log(`\nCreating KV namespace ${title}…`);
  const output = runCapture(`npx wrangler kv namespace create ${title}`);
  const idMatch = output.match(/id = "([a-f0-9]{32})"/);
  if (!idMatch) die(`Could not parse KV id from:\n${output}`);
  const id = idMatch[1];
  if (FORBIDDEN_KV.has(id)) die(`Refusing production KV id ${id}`);
  console.log(`  ${title} → ${id}`);
  return id;
}

if (!token) {
  die(
    "CLOUDFLARE_API_TOKEN is required. Do not paste production WhatsApp secrets here — only Cloudflare deploy token + Meta TEST credentials.",
  );
}

if (process.env.D360_API_KEY?.trim()) {
  die("D360_API_KEY is set in the environment. Staging must not receive 360dialog credentials. Unset it and re-run.");
}

const missing = REQUIRED_META.filter((k) => !process.env[k]?.trim());
if (missing.length) {
  die(
    `Missing Meta TEST credentials: ${missing.join(", ")}.\n` +
      "Create a Meta test number / WABA first (see docs/whatsapp-business-api.md). Do not use production tokens.",
  );
}

let toml = readFileSync(stagingPath, "utf8");
if (!toml.includes('name = "reimagined-octo-meme-whatsapp-staging"')) {
  die("wrangler.staging.toml must target reimagined-octo-meme-whatsapp-staging only");
}

let trackingId = toml.match(/binding = "TRACKING_STORE"\s*\nid = "([a-f0-9]{32}|REPLACE_WITH_STAGING_TRACKING_STORE_ID)"/)?.[1];
let counterId = toml.match(/binding = "BOOKING_COUNTER"\s*\nid = "([a-f0-9]{32}|REPLACE_WITH_STAGING_BOOKING_COUNTER_ID)"/)?.[1];

if (!trackingId || trackingId.startsWith("REPLACE_")) {
  trackingId = createKv("matni-whatsapp-staging-tracking");
  toml = toml.replace("REPLACE_WITH_STAGING_TRACKING_STORE_ID", trackingId);
}
if (!counterId || counterId.startsWith("REPLACE_")) {
  counterId = createKv("matni-whatsapp-staging-booking-counter");
  toml = toml.replace("REPLACE_WITH_STAGING_BOOKING_COUNTER_ID", counterId);
}

if (FORBIDDEN_KV.has(trackingId) || FORBIDDEN_KV.has(counterId)) {
  die("Staging KV ids must not equal production namespace ids");
}

writeFileSync(stagingPath, toml);
console.log("\nUpdated wrangler.staging.toml with isolated KV ids");

run("node ../../scripts/sync-worker-shared.mjs", { cwd: workerDir });
run("npx wrangler deploy --config wrangler.staging.toml");

for (const name of REQUIRED_META) {
  putSecret(name, process.env[name]);
}
if (process.env.ANTHROPIC_API_KEY?.trim()) {
  putSecret("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
} else {
  console.log("  skip ANTHROPIC_API_KEY (optional — AI replies will be limited on staging)");
}

console.log(`
Staging deploy complete.

Next:
1. Meta App → WhatsApp → Configuration → Webhook
   Callback: https://reimagined-octo-meme-whatsapp-staging.<your-subdomain>.workers.dev/whatsapp/webhook
   Verify token: (the WHATSAPP_VERIFY_TOKEN you just set)
   Subscribe: messages (and smb_message_echoes if available on the test number)
2. Open GET /whatsapp/status on the staging Worker
3. Open GET /whatsapp/templates then ?submit=1 for mat_* templates
4. Message the Meta TEST number only — never the live 07549 815538 business number

Coexistence gate (mandatory before any live migration):
Confirm with Meta whether direct Cloud API hosting retains WhatsApp Business App Coexistence
for the existing number. Do not migrate until that is confirmed in writing.
`);
