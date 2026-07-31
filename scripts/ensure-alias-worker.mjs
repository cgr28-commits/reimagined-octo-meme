import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aliasWorkerName = "my-airport-taxi-ni";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workerDir = join(repoRoot, "workers/addresses");

if (process.env.ENSURING_ALIAS_WORKER === "1") {
  console.log("Alias worker deploy already in progress, skipping nested build step.");
  process.exit(0);
}

const inCloudflareCi = Boolean(process.env.WRANGLER_CI_OVERRIDE_NAME);
const hasApiToken = Boolean(process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN);

if (!inCloudflareCi && !hasApiToken) {
  console.log("Skipping alias worker deploy outside Cloudflare CI.");
  process.exit(0);
}

console.log(`Ensuring alias worker "${aliasWorkerName}" exists for service binding...`);

execSync("npx wrangler deploy", {
  cwd: workerDir,
  stdio: "inherit",
  env: {
    ...process.env,
    ENSURING_ALIAS_WORKER: "1",
    WRANGLER_CI_OVERRIDE_NAME: aliasWorkerName,
  },
});

console.log(`Alias worker "${aliasWorkerName}" is ready.`);
