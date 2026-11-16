#!/usr/bin/env node
/**
 * Build the PREVIEW website for the isolated bespoke preview (never the live site).
 *
 * Why: src/lib/worker-api.ts falls back to the PRODUCTION Worker when
 * NEXT_PUBLIC_BOOKINGS_API_URL is unset. A preview site built without it would
 * call production. This script pins the preview Worker, refuses anything else,
 * and verifies the built JavaScript actually points at the preview Worker.
 *
 * Usage (repo root):  node scripts/build-bespoke-preview-site.mjs
 *        check only:   node scripts/build-bespoke-preview-site.mjs --check-only
 * Then deploy (owner, after approval):
 *   npx wrangler pages deploy out --project-name=matni-bespoke-preview --branch=preview
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const PREVIEW_WORKER_ORIGIN = "https://reimagined-octo-meme-bespoke-preview.cgr28.workers.dev";
export const PRODUCTION_WORKER_HOST = "reimagined-octo-meme.cgr28.workers.dev";

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const worker = (process.env.PREVIEW_WORKER_ORIGIN || PREVIEW_WORKER_ORIGIN).replace(/\/+$/, "");
let host = "";
try {
  const url = new URL(worker);
  host = url.hostname;
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search) fail(`Preview Worker origin must be a bare https origin: ${worker}`);
} catch {
  fail(`Invalid preview Worker origin: ${worker}`);
}
if (host === PRODUCTION_WORKER_HOST || host.endsWith("myairporttaxini.co.uk")) fail(`Refusing to build the preview site against production (${host}).`);
if (!host.startsWith("reimagined-octo-meme-bespoke-preview.")) fail(`Unexpected preview Worker host: ${host}`);

const env = {
  ...process.env,
  GITHUB_PAGES: "true",
  NEXT_PUBLIC_BOOKINGS_API_URL: `${worker}/bookings`,
  NEXT_PUBLIC_ADDRESSES_API_URL: `${worker}/addresses`,
  // Preview only: show the Belfast events hub and request pages (OFF on the live site).
  NEXT_PUBLIC_BESPOKE_PUBLIC_PAGES: "1",
  // Cloudflare's public always-pass TEST site key unless a real preview widget key is given.
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.PREVIEW_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
};
console.log(`Preview Worker: ${worker}`);
if (process.argv.includes("--check-only")) {
  console.log("✓ Configuration OK (check only, nothing built).");
  process.exit(0);
}

execFileSync("rm", ["-rf", ".next"], { stdio: "inherit" });
execFileSync("npm", ["run", "build"], { stdio: "inherit", env });
// The build regenerates the sitemap; never let that leak into a commit.
try {
  execFileSync("git", ["checkout", "--", "public/sitemap.xml"], { stdio: "ignore" });
} catch {
  // not a git checkout — fine
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".js") ? [path] : [];
  });
}
const bundles = walk("out/_next/static");
const hits = bundles.filter((f) => readFileSync(f, "utf8").includes(host));
if (hits.length === 0) fail("Built JavaScript does not reference the preview Worker — do NOT deploy this build.");
console.log(`✓ Built site references the preview Worker in ${hits.length} bundle(s).`);
console.log("Next (after approval): npx wrangler pages deploy out --project-name=matni-bespoke-preview --branch=preview");
