#!/usr/bin/env node
/**
 * One-shot Cloudflare Worker setup for My Airport Taxi NI.
 *
 * Usage (from repo root):
 *   CLOUDFLARE_API_TOKEN=... GOOGLE_PLACES_API_KEY=... WEB3FORMS_ACCESS_KEY=... node scripts/setup-worker.mjs
 *
 * Optional env vars:
 *   CLOUDFLARE_ACCOUNT_ID (default: 36c5c88df4c1f0259413d555f2679f3c)
 *   GETADDRESS_API_KEY, IDEAL_POSTCODES_API_KEY, BOOKING_TO_EMAIL, BOOKING_FROM_EMAIL
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;
const workerDir = join(repoRoot, "workers/addresses");
const wranglerPath = join(workerDir, "wrangler.toml");
const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
  process.env.CF_ACCOUNT_ID?.trim() ||
  "36c5c88df4c1f0259413d555f2679f3c";
const token =
  process.env.CLOUDFLARE_API_TOKEN?.trim() || process.env.CF_API_TOKEN?.trim();

function run(command, options = {}) {
  console.log(`\n→ ${command}`);
  execSync(command, {
    stdio: "inherit",
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token },
  });
}

function runCapture(command, options = {}) {
  return execSync(command, {
    encoding: "utf8",
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token },
  }).trim();
}

function putSecret(name, value) {
  if (!value?.trim()) {
    console.log(`  skip ${name} (not provided)`);
    return;
  }

  console.log(`  set ${name}`);
  const result = spawnSync("npx", ["wrangler", "secret", "put", name], {
    input: value.trim(),
    cwd: workerDir,
    stdio: ["pipe", "inherit", "inherit"],
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token },
  });

  if (result.status !== 0) {
    throw new Error(`Failed to set secret ${name}`);
  }
}

function ensureKvNamespace(binding, title) {
  const wrangler = readFileSync(wranglerPath, "utf8");
  const bindingPattern = new RegExp(
    `\\[\\[kv_namespaces\\]\\][\\s\\S]*?binding = "${binding}"\\s*\\nid = "([a-f0-9]{32})"`,
  );
  const existingMatch = wrangler.match(bindingPattern);
  if (existingMatch) {
    console.log(`${title} KV namespace already configured (${existingMatch[1]})`);
    return wrangler;
  }

  console.log(`\nCreating ${title} KV namespace…`);
  const output = runCapture(`npx wrangler kv namespace create ${title}`, {
    cwd: workerDir,
  });
  const idMatch = output.match(/id = "([a-f0-9]{32})"/);
  if (!idMatch) {
    throw new Error(`Could not parse KV namespace id from:\n${output}`);
  }

  const kvBlock = `\n[[kv_namespaces]]\nbinding = "${binding}"\nid = "${idMatch[1]}"\n`;
  let updated = wrangler;

  if (binding === "BOOKING_COUNTER" && wrangler.includes("REPLACE_WITH_KV_NAMESPACE_ID")) {
    updated = wrangler.replace(
      /id = "REPLACE_WITH_KV_NAMESPACE_ID"/,
      `id = "${idMatch[1]}"`,
    );
  } else if (!bindingPattern.test(wrangler)) {
    updated = wrangler.replace(
      /# Until then, bookings work without sequential references\.\n/,
      `# Until then, bookings work without sequential references.\n${kvBlock}`,
    );
    if (updated === wrangler) {
      updated = `${wrangler.trimEnd()}\n${kvBlock}`;
    }
  }

  writeFileSync(wranglerPath, updated);
  console.log(`Updated wrangler.toml with ${binding} KV id ${idMatch[1]}`);
  return updated;
}

function ensureKvNamespaces() {
  ensureKvNamespace("BOOKING_COUNTER", "BOOKING_COUNTER");
  ensureKvNamespace("TRACKING_STORE", "TRACKING_STORE");
}

function generateDriverAccessKey() {
  return execSync("openssl rand -hex 24", { encoding: "utf8" }).trim();
}

function printPostSetupSteps() {
  console.log(`
Setup complete. Verify:

  curl "https://reimagined-octo-meme.cgr28.workers.dev/addresses?q=belfast"
  curl -X POST "https://reimagined-octo-meme.cgr28.workers.dev/bookings" \\
    -H "Content-Type: application/json" \\
    -d '{"customerName":"Test","message":"Worker setup test"}'

For best email deliverability (optional, replaces Web3Forms fallback):
  1. Cloudflare dashboard → Compute → Email Service → Email Sending → Onboard Domain
  2. Choose myairporttaxini.co.uk and add the DNS records Cloudflare suggests
  3. Redeploy the worker (this script or GitHub Actions)

For live driver tracking (optional):
  Driver dashboard: https://www.myairporttaxini.co.uk/driver/
  Set DRIVER_ACCESS_KEY when running setup-worker.mjs (auto-generated if omitted).

GitHub Actions deploy: add repository secrets
  CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
Then push to main (workers/addresses/**) or run "Deploy Cloudflare Worker" workflow.
`);
}

if (!token) {
  console.error(`
Missing CLOUDFLARE_API_TOKEN.

Create a token at https://dash.cloudflare.com/profile/api-tokens with:
  - Account → Workers Scripts → Edit
  - Account → Workers KV Storage → Edit
  - Account → Workers Secrets → Edit

Then run:
  CLOUDFLARE_API_TOKEN=your_token \\
  GOOGLE_PLACES_API_KEY=your_google_key \\
  WEB3FORMS_ACCESS_KEY=your_web3forms_key \\
  node scripts/setup-worker.mjs
`);
  process.exit(1);
}

console.log("My Airport Taxi NI — Cloudflare Worker setup");
console.log(`Account: ${accountId}`);

run("node scripts/sync-worker-shared.mjs");
run("npm ci", { cwd: workerDir });

ensureKvNamespaces();

console.log("\nSetting worker secrets…");
putSecret("GOOGLE_PLACES_API_KEY", process.env.GOOGLE_PLACES_API_KEY);
putSecret("IDEAL_POSTCODES_API_KEY", process.env.IDEAL_POSTCODES_API_KEY);
putSecret("GETADDRESS_API_KEY", process.env.GETADDRESS_API_KEY);
putSecret("WEB3FORMS_ACCESS_KEY", process.env.WEB3FORMS_ACCESS_KEY);
putSecret("BOOKING_TO_EMAIL", "bookings@myairporttaxini.co.uk");
putSecret("BOOKING_FROM_EMAIL", "bookings@myairporttaxini.co.uk");
putSecret("GOOGLE_CALENDAR_ID", process.env.GOOGLE_CALENDAR_ID ?? "colinrice876@gmail.com");
putSecret(
  "GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON",
  process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON,
);
putSecret(
  "DRIVER_ACCESS_KEY",
  process.env.DRIVER_ACCESS_KEY ?? generateDriverAccessKey(),
);
if (process.env.GOOGLE_REVIEW_URL?.trim()) {
  putSecret("GOOGLE_REVIEW_URL", process.env.GOOGLE_REVIEW_URL.trim());
}

console.log("\nDeploying worker…");
run("npx wrangler deploy", { cwd: workerDir });

printPostSetupSteps();
