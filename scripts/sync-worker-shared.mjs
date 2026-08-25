import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(repoRoot, "shared");
const targetDir = join(repoRoot, "workers/addresses/shared");

if (!existsSync(sourceDir)) {
  console.error("Missing shared/ directory at repo root");
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

const sharedFiles = readdirSync(sourceDir).filter(
  (name) => name.endsWith(".ts") || name.endsWith(".json"),
);
for (const file of sharedFiles) {
  cpSync(join(sourceDir, file), join(targetDir, file));
}

console.log(`Synced ${sharedFiles.length} shared modules into workers/addresses/shared/`);
