#!/usr/bin/env node
/**
 * Prepares the isolated bespoke preview in the STAGING Cloudflare account only.
 * Used by .github/workflows/deploy-bespoke-preview.yml (never by production deploys).
 *
 * 1. Finds or creates the two preview KV namespaces and the preview Pages project.
 * 2. Writes workers/addresses/wrangler.bespoke-preview.generated.toml: a copy of
 *    wrangler.bespoke-preview.toml with the placeholders filled in. The committed
 *    file keeps its placeholders, so no ids or addresses are committed.
 * 3. Refuses to continue if anything points at the live account or live storage.
 *
 * Needs CLOUDFLARE_API_TOKEN (staging-account token). Prints no secrets.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

export const STAGING_ACCOUNT_ID = "ecad568dc411e28a3e435ef40b36c2b5";
export const LIVE_IDS = [
  "36c5c88df4c1f0259413d555f2679f3c", // live Cloudflare account
  "53fa3cc2bd46436f90ae19200e599ea1", // live KV
  "869e2c2e02004d4a88c9cfbf563f1d6a", // live KV
];
export const PAGES_PROJECT = "matni-bespoke-preview";
export const KV_TITLES = { tracking: "matni-bespoke-preview-tracking", counter: "matni-bespoke-preview-booking-counter" };
const SOURCE = "workers/addresses/wrangler.bespoke-preview.toml";
const TARGET = "workers/addresses/wrangler.bespoke-preview.generated.toml";
const DEFAULT_SITE = "matni-bespoke-preview.pages.dev";
/** Undeliverable by design: with no tester inbox configured, every preview email is blocked. */
const NO_TESTER = "preview-tester@example.invalid";

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

/** Pure: fill the placeholders. Exported for the offline check. */
export function renderPreviewConfig(source, { trackingId, counterId, siteHost, testerEmails }) {
  const out = source
    .replace("REPLACE_WITH_BESPOKE_PREVIEW_TRACKING_STORE_ID", trackingId)
    .replace("REPLACE_WITH_BESPOKE_PREVIEW_BOOKING_COUNTER_ID", counterId)
    .replaceAll("REPLACE_WITH_TESTER_EMAIL", testerEmails)
    .replaceAll(DEFAULT_SITE, siteHost);
  const active = out
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  if (!new RegExp(`^account_id = "${STAGING_ACCOUNT_ID}"$`, "m").test(active)) throw new Error("Config is not pinned to the staging account.");
  for (const id of LIVE_IDS) if (active.includes(id)) throw new Error(`Live resource id ${id} found in the preview config.`);
  if (/REPLACE_WITH_/.test(active)) throw new Error("Unfilled placeholder in the preview config.");
  if (!/^[a-f0-9]{32}$/.test(trackingId) || !/^[a-f0-9]{32}$/.test(counterId) || trackingId === counterId) throw new Error("KV namespace ids are invalid.");
  if (!/^[a-z0-9-]+\.pages\.dev$/.test(siteHost)) throw new Error(`Unexpected preview site host: ${siteHost}`);
  if (/(^|,)\s*bookings@myairporttaxini\.co\.uk\s*(,|$)/i.test(testerEmails)) throw new Error("The live bookings mailbox cannot be a preview tester inbox.");
  if (!/^PREVIEW_ENVIRONMENT = "bespoke-preview"$/m.test(active)) throw new Error("PREVIEW_ENVIRONMENT missing.");
  if (/send_email/.test(active)) throw new Error("Preview must not bind Cloudflare Email.");
  return out;
}

async function api(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${STAGING_ACCOUNT_ID}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok && data.success !== false, result: data.result, errors: data.errors };
}

async function ensureKv(title) {
  const list = await api("/storage/kv/namespaces?per_page=100");
  if (!list.ok) fail(`Could not list KV namespaces in the staging account (HTTP ${list.status}).`);
  const found = (list.result ?? []).find((ns) => ns.title === title);
  if (found) return found.id;
  const created = await api("/storage/kv/namespaces", { method: "POST", body: JSON.stringify({ title }) });
  if (!created.ok || !created.result?.id) fail(`Could not create KV namespace ${title} (HTTP ${created.status}).`);
  console.log(`Created isolated KV namespace ${title}`);
  return created.result.id;
}

async function ensurePagesProject() {
  let project = await api(`/pages/projects/${PAGES_PROJECT}`);
  if (project.status === 404 || !project.ok) {
    const created = await api("/pages/projects", { method: "POST", body: JSON.stringify({ name: PAGES_PROJECT, production_branch: "preview" }) });
    if (!created.ok) fail(`Could not create the Pages project ${PAGES_PROJECT} (HTTP ${created.status}).`);
    console.log(`Created Pages project ${PAGES_PROJECT}`);
    project = created;
  }
  const host = String(project.result?.subdomain ?? "").toLowerCase();
  if (!host) fail("Pages project has no address yet.");
  return host;
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) fail("CLOUDFLARE_API_TOKEN (staging) is not set.");
  const [trackingId, counterId, siteHost] = [await ensureKv(KV_TITLES.tracking), await ensureKv(KV_TITLES.counter), await ensurePagesProject()];
  const testerEmails = (process.env.BESPOKE_PREVIEW_TESTER_EMAIL || "").trim().toLowerCase() || NO_TESTER;
  let rendered;
  try {
    rendered = renderPreviewConfig(readFileSync(SOURCE, "utf8"), { trackingId, counterId, siteHost, testerEmails });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Preview config could not be prepared.");
  }
  writeFileSync(TARGET, rendered);
  console.log(`Preview config written (site https://${siteHost}; tester inbox ${testerEmails === NO_TESTER ? "not set: all emails blocked" : "set"}).`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `site_host=${siteHost}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
