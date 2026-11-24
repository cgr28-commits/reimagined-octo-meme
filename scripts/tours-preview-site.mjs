#!/usr/bin/env node
/**
 * WP-B0: builds the PREVIEW website for the Private Tours preview (never the live site).
 *
 * src/lib/worker-api.ts falls back to the PRODUCTION Worker when NEXT_PUBLIC_BOOKINGS_API_URL is unset.
 * This script pins the tours preview Worker, refuses anything else, and verifies the built JavaScript
 * points at the preview Worker and never at the production Worker.
 * Usage: PREVIEW_WORKER_ORIGIN=https://reimagined-octo-meme-tours-preview.<sub>.workers.dev node scripts/tours-preview-site.mjs
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PRODUCTION_WORKER_HOST = "reimagined-octo-meme.cgr28.workers.dev";
const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

const worker = (process.env.PREVIEW_WORKER_ORIGIN || "").replace(/\/+$/, "");
let host = "";
try {
  const url = new URL(worker);
  host = url.hostname;
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search) fail(`Preview Worker origin must be a bare https origin: ${worker}`);
} catch {
  fail("PREVIEW_WORKER_ORIGIN is missing or invalid.");
}
if (host === PRODUCTION_WORKER_HOST || host.endsWith("myairporttaxini.co.uk")) fail(`Refusing to build the preview site against production (${host}).`);
if (!host.startsWith("reimagined-octo-meme-tours-preview.")) fail(`Unexpected preview Worker host: ${host}`);

const env = {
  ...process.env,
  GITHUB_PAGES: "true",
  NEXT_PUBLIC_BOOKINGS_API_URL: `${worker}/bookings`,
  NEXT_PUBLIC_ADDRESSES_API_URL: `${worker}/addresses`,
  // No advertising, analytics or form-relay keys in a test site.
  NEXT_PUBLIC_GOOGLE_ADS_ID: "",
  NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY: "",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA", // Cloudflare's public always-pass TEST key
};
console.log(`Preview Worker: ${worker}`);
execFileSync("rm", ["-rf", ".next"], { stdio: "inherit" });
execFileSync("npm", ["run", "build"], { stdio: "inherit", env });

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".js") ? [path] : [];
  });
}
const bundles = walk("out/_next/static");
const withPreview = bundles.filter((f) => readFileSync(f, "utf8").includes(host));
if (withPreview.length === 0) fail("Built JavaScript does not reference the preview Worker: do NOT deploy this build.");
const withProduction = bundles.filter((f) => readFileSync(f, "utf8").includes(PRODUCTION_WORKER_HOST));
console.log(`Built site references the preview Worker in ${withPreview.length} bundle(s) and the production Worker in ${withProduction.length} bundle(s).`);
if (withProduction.length > 0) fail("Built JavaScript still references the PRODUCTION Worker: do NOT deploy this build.");
