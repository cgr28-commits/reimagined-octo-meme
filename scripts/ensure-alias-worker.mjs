import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workerScript = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "workers",
  "addresses",
  "scripts",
  "ensure-alias-worker.mjs",
);

execSync(`node "${workerScript}"`, { stdio: "inherit" });
