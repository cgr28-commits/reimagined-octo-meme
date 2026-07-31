import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aliasWorkerName = "my-airport-taxi-ni";
const workerDir = join(dirname(fileURLToPath(import.meta.url)), "..");

if (process.env.ENSURING_ALIAS_WORKER === "1") {
  console.log("Alias worker deploy already in progress, skipping nested build step.");
  process.exit(0);
}

console.log(`Ensuring alias worker "${aliasWorkerName}" exists for service binding...`);

try {
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
} catch (error) {
  if (process.env.CI === "true") {
    console.error(`Alias worker deploy failed in CI: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  console.log("Alias worker deploy skipped locally (no Cloudflare credentials).");
}
