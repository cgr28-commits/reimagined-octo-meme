#!/usr/bin/env node
/**
 * Set or rotate the driver dashboard access key on the production worker.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=your_token \
 *   DRIVER_ACCESS_KEY="choose-a-long-password" \
 *   node scripts/set-driver-access-key.mjs
 *
 * If DRIVER_ACCESS_KEY is omitted, a random key is generated and printed.
 */
import { execSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;
const workerDir = join(repoRoot, "workers/addresses");
const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
  process.env.CF_ACCOUNT_ID?.trim() ||
  "36c5c88df4c1f0259413d555f2679f3c";
const token =
  process.env.CLOUDFLARE_API_TOKEN?.trim() || process.env.CF_API_TOKEN?.trim();

function generateDriverAccessKey(): string {
  return execSync("openssl rand -hex 24", { encoding: "utf8" }).trim();
}

if (!token) {
  console.error(`
Missing CLOUDFLARE_API_TOKEN.

1. Create a token at https://dash.cloudflare.com/profile/api-tokens
   with Workers Scripts Edit + Workers Secrets Edit.

2. Run:
   CLOUDFLARE_API_TOKEN=your_token \\
   DRIVER_ACCESS_KEY="your-chosen-password" \\
   node scripts/set-driver-access-key.mjs
`);
  process.exit(1);
}

const driverKey = process.env.DRIVER_ACCESS_KEY?.trim() || generateDriverAccessKey();
const generated = !process.env.DRIVER_ACCESS_KEY?.trim();

console.log("Setting DRIVER_ACCESS_KEY on worker reimagined-octo-meme…");

const result = spawnSync("npx", ["wrangler", "secret", "put", "DRIVER_ACCESS_KEY"], {
  input: driverKey,
  cwd: workerDir,
  stdio: ["pipe", "inherit", "inherit"],
  env: {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: token,
  },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("\nDriver access key updated.\n");
console.log("Sign in at https://www.myairporttaxini.co.uk/driver/ with this key:\n");
console.log(driverKey);
console.log(
  generated
    ? "\n(Saved above — Cloudflare cannot show this value again after you close the terminal.)"
    : "\n(Using the DRIVER_ACCESS_KEY value you provided.)",
);
console.log(
  "\nOptional: add the same value to GitHub → Settings → Secrets → Actions as DRIVER_ACCESS_KEY.",
);
