import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aliasWorkerName = "my-airport-taxi-ni";
const workerDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWorkersCi = process.env.WORKERS_CI === "1" || process.env.CI === "true";

if (process.env.ENSURING_ALIAS_WORKER === "1") {
  console.log("Alias worker deploy already in progress, skipping nested build step.");
  process.exit(0);
}

console.log(`Ensuring alias worker "${aliasWorkerName}" exists for service binding...`);

const aliasEnv = { ...process.env, ENSURING_ALIAS_WORKER: "1" };
delete aliasEnv.WRANGLER_CI_OVERRIDE_NAME;

try {
  execSync(`npx wrangler deploy --config wrangler.alias.toml --name ${aliasWorkerName}`, {
    cwd: workerDir,
    stdio: "inherit",
    env: aliasEnv,
  });
  console.log(`Alias worker "${aliasWorkerName}" is ready.`);
} catch (error) {
  if (isWorkersCi) {
    console.error(
      `Alias worker deploy failed in Workers CI: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }

  console.log("Alias worker deploy skipped locally (no Cloudflare credentials).");
}
