import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;
const sourceDir = join(repoRoot, "shared");
const targetDir = join(repoRoot, "workers/addresses/shared");

if (!existsSync(sourceDir)) {
  console.error("Missing shared/ directory at repo root");
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

for (const file of readdirSync(sourceDir).filter((name) => name.endsWith(".ts"))) {
  cpSync(join(sourceDir, file), join(targetDir, file));
}

console.log(`Synced ${readdirSync(targetDir).length} shared modules into workers/addresses/shared/`);
