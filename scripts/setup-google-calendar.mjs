#!/usr/bin/env node
/**
 * Configure Google Calendar secrets on the Cloudflare Worker.
 *
 * Prerequisites (one-time in Google Cloud / Google Calendar):
 * 1. Enable Google Calendar API
 * 2. Create a service account and download its JSON key
 * 3. Share colinrice876@gmail.com with the service account email
 *    using "Make changes to events"
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=... \
 *   GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON="$(cat service-account.json)" \
 *   node scripts/setup-google-calendar.mjs
 *
 * Or:
 *   CLOUDFLARE_API_TOKEN=... \
 *   GOOGLE_CALENDAR_SERVICE_ACCOUNT_FILE=./service-account.json \
 *   node scripts/setup-google-calendar.mjs
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;
const workerDir = join(repoRoot, "workers/addresses");
const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
  process.env.CF_ACCOUNT_ID?.trim() ||
  "36c5c88df4c1f0259413d555f2679f3c";
const token =
  process.env.CLOUDFLARE_API_TOKEN?.trim() || process.env.CF_API_TOKEN?.trim();
const calendarId =
  process.env.GOOGLE_CALENDAR_ID?.trim() || "colinrice876@gmail.com";

function loadServiceAccountJson() {
  const inline = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) {
    return inline;
  }

  const filePath = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_FILE?.trim();
  if (filePath) {
    return readFileSync(filePath, "utf8").trim();
  }

  return "";
}

function validateServiceAccountJson(raw) {
  const parsed = JSON.parse(raw);
  if (parsed.type !== "service_account") {
    throw new Error("JSON is not a service account key");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Service account JSON is missing client_email or private_key");
  }
  return parsed.client_email;
}

function putSecret(name, value) {
  const result = spawnSync("npx", ["wrangler", "secret", "put", name], {
    input: value,
    cwd: workerDir,
    stdio: ["pipe", "inherit", "inherit"],
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: token,
    },
  });

  if (result.status !== 0) {
    throw new Error(`Failed to set secret ${name}`);
  }
}

async function checkCalendarStatus() {
  const response = await fetch(
    "https://reimagined-octo-meme.cgr28.workers.dev/calendar-status",
  );
  return response.json();
}

if (!token) {
  console.error(`
Missing CLOUDFLARE_API_TOKEN.

Create a token at https://dash.cloudflare.com/profile/api-tokens with:
  - Account → Workers Scripts → Edit
  - Account → Workers Secrets → Edit

Then run:
  CLOUDFLARE_API_TOKEN=your_token \\
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_FILE=./service-account.json \\
  node scripts/setup-google-calendar.mjs
`);
  process.exit(1);
}

const serviceAccountJson = loadServiceAccountJson();
if (!serviceAccountJson) {
  console.error(`
Missing service account JSON.

Download a JSON key from Google Cloud Console, then run either:

  GOOGLE_CALENDAR_SERVICE_ACCOUNT_FILE=./service-account.json node scripts/setup-google-calendar.mjs

or:

  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' node scripts/setup-google-calendar.mjs
`);
  process.exit(1);
}

let serviceAccountEmail = "";
try {
  serviceAccountEmail = validateServiceAccountJson(serviceAccountJson);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

console.log("My Airport Taxi NI — Google Calendar setup");
console.log(`Calendar: ${calendarId}`);
console.log(`Service account: ${serviceAccountEmail}`);
console.log("\nSetting worker secrets…");

putSecret("GOOGLE_CALENDAR_ID", calendarId);
putSecret("GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON", serviceAccountJson);

console.log("\nSecrets saved. Checking connection…");

const status = await checkCalendarStatus();
console.log(JSON.stringify(status, null, 2));

if (status.connected) {
  console.log("\nGoogle Calendar is connected.");
  process.exit(0);
}

console.log(`
Secrets were saved, but the live connection check did not succeed yet.

If this is the first deploy after adding secrets, wait ~30 seconds and open:
  https://reimagined-octo-meme.cgr28.workers.dev/calendar-status

Also confirm in Google Calendar that you shared ${calendarId} with:
  ${serviceAccountEmail}
using permission: Make changes to events
`);
process.exit(status.configured ? 1 : 0);
