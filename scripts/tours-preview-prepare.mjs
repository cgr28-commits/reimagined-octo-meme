#!/usr/bin/env node
/**
 * WP-B0: prepares the isolated Private Tours preview in the STAGING Cloudflare account only.
 * Used by .github/workflows/deploy-tours-preview.yml (never by production deploys).
 *
 * 1. Finds or creates the two preview KV namespaces and the preview Pages project (staging account).
 * 2. Renders workers/addresses/wrangler.tours-preview.generated.toml from the existing preview template
 *    (wrangler.bespoke-preview.toml, which is NOT edited). The generated file is never committed.
 * 3. Runs the isolation guard on the rendered config and stops before any deploy if it fails.
 *
 * Needs CLOUDFLARE_API_TOKEN (staging token). Prints no secrets.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { PRODUCTION_WRANGLER, PREVIEW_WORKER_NAME, STAGING_ACCOUNT_ID, assertConfigIsStagingOnly } from "./tours-preview-guard.mjs";

export const PAGES_PROJECT = "matni-tours-preview";
export const KV_TITLES = { tracking: "matni-tours-preview-tracking", counter: "matni-tours-preview-booking-counter" };
const SOURCE = "workers/addresses/wrangler.bespoke-preview.toml";
const TARGET = "workers/addresses/wrangler.tours-preview.generated.toml";
const TEMPLATE_SITE = "matni-bespoke-preview.pages.dev";
/** Undeliverable by design: with no tester inbox configured, every preview email is blocked. */
const NO_TESTER = "preview-tester@example.invalid";

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

async function api(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${STAGING_ACCOUNT_ID}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok && data.success !== false, result: data.result };
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
  if (!project.ok) {
    const created = await api("/pages/projects", { method: "POST", body: JSON.stringify({ name: PAGES_PROJECT, production_branch: "preview" }) });
    if (!created.ok) fail(`Could not create the Pages project ${PAGES_PROJECT} (HTTP ${created.status}).`);
    console.log(`Created Pages project ${PAGES_PROJECT}`);
    project = created;
  }
  const host = String(project.result?.subdomain ?? "").toLowerCase();
  if (!/^[a-z0-9-]+\.pages\.dev$/.test(host)) fail("Pages project has no valid *.pages.dev address.");
  return host;
}

/** Pure: fill the template. Exported for tests. */
export function renderTourPreviewConfig(source, { trackingId, counterId, siteHost, testerEmails }) {
  return source
    .replace('name = "reimagined-octo-meme-bespoke-preview"', `name = "${PREVIEW_WORKER_NAME}"`)
    .replace("REPLACE_WITH_BESPOKE_PREVIEW_TRACKING_STORE_ID", trackingId)
    .replace("REPLACE_WITH_BESPOKE_PREVIEW_BOOKING_COUNTER_ID", counterId)
    .replaceAll("REPLACE_WITH_TESTER_EMAIL", testerEmails)
    .replaceAll(TEMPLATE_SITE, siteHost)
    .replace("Deployed ONLY by .github/workflows/deploy-bespoke-preview.yml", "Rendered for the TOURS preview by .github/workflows/deploy-tours-preview.yml");
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) fail("CLOUDFLARE_API_TOKEN (staging) is not set.");
  const trackingId = await ensureKv(KV_TITLES.tracking);
  const counterId = await ensureKv(KV_TITLES.counter);
  const siteHost = await ensurePagesProject();
  const testerEmails = (process.env.TOURS_PREVIEW_TESTER_EMAIL || "").trim().toLowerCase() || NO_TESTER;
  if (/(^|,)\s*bookings@myairporttaxini\.co\.uk\s*(,|$)/i.test(testerEmails)) fail("The live bookings mailbox cannot be a preview tester inbox.");
  const rendered = renderTourPreviewConfig(readFileSync(SOURCE, "utf8"), { trackingId, counterId, siteHost, testerEmails });
  const problems = assertConfigIsStagingOnly({ config: rendered, accountIdEnv: process.env.CLOUDFLARE_ACCOUNT_ID || STAGING_ACCOUNT_ID, productionWrangler: readFileSync(PRODUCTION_WRANGLER, "utf8") });
  if (problems.length) {
    for (const problem of problems) console.error(`::error::${problem}`);
    process.exit(1);
  }
  writeFileSync(TARGET, rendered);
  console.log(`Preview config written (site https://${siteHost}; tester inbox ${testerEmails === NO_TESTER ? "not set: all emails blocked" : "set"}).`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `site_host=${siteHost}\nkv_ids=${trackingId},${counterId}\n`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) await main();
