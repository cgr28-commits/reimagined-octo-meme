import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workerDir = join(dirname(fileURLToPath(import.meta.url)), "..");

execSync("node scripts/ensure-alias-worker.mjs", {
  cwd: workerDir,
  stdio: "inherit",
});

execSync("npx wrangler deploy", {
  cwd: workerDir,
  stdio: "inherit",
});
