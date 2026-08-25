/**
 * Guard: public marketing / SEO must not advertise static “from £X” starting prices.
 * Quote engine numbers in pricing-config / quote.ts are out of scope.
 *
 * Run: npx tsx scripts/check-no-public-from-prices.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  SITE_PUBLIC_SEO_BLURB,
  SITE_PUBLIC_SEO_DESCRIPTION,
} from "../src/lib/data";

const root = process.cwd();

/** Public-facing source trees (marketing, SEO, visible UI copy). */
const PUBLIC_DIRS = ["src/app", "src/components", "src/lib", "public"];

const FORBIDDEN = [
  /prices\s+from\s*£\s*\d+/i,
  /from\s*£\s*\d+/i,
  /starting\s+from\s*£\s*\d+/i,
  /as\s+low\s+as\s*£\s*\d+/i,
  /LOWEST_AIRPORT_FROM_PRICE/,
];

/** Files that may contain £ amounts for ops / quotes / partners — skip. */
const SKIP_NAME =
  /(pricing-config|quote\.ts|quote-service|create-payment|submit-booking|Owner|Driver|refund|invoice-example|partners\/|tracking-demo|test-booking|check-)/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|html|json|mdx)$/.test(name)) out.push(full);
  }
  return out;
}

console.log("=== SEO constants ===");
assert.match(SITE_PUBLIC_SEO_BLURB, /clear fixed pricing/i);
assert.match(SITE_PUBLIC_SEO_BLURB, /24\/7 availability/i);
assert.doesNotMatch(SITE_PUBLIC_SEO_BLURB, /£\d/);
assert.doesNotMatch(SITE_PUBLIC_SEO_DESCRIPTION, /£\d/);
assert.doesNotMatch(SITE_PUBLIC_SEO_DESCRIPTION, /prices from/i);
console.log("OK  shared SEO blurb has no static £ starting price");

console.log("\n=== Wired into layout / footer / JSON-LD ===");
{
  const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
  const footer = readFileSync(join(root, "src/components/Footer.tsx"), "utf8");
  const structured = readFileSync(join(root, "src/lib/structured-data.ts"), "utf8");
  assert.match(layout, /SITE_PUBLIC_SEO_DESCRIPTION/);
  assert.match(footer, /SITE_PUBLIC_SEO_BLURB/);
  assert.match(structured, /SITE_PUBLIC_SEO_DESCRIPTION/);
}
console.log("OK  meta, footer, structured data use shared copy");

console.log("\n=== Scan public trees for From £ / prices from £ ===");
const hits: string[] = [];
for (const rel of PUBLIC_DIRS) {
  const abs = join(root, rel);
  for (const file of walk(abs)) {
    if (SKIP_NAME.test(file)) continue;
    // Airport basePrice fields in data.ts are engine inputs, not marketing copy —
    // still forbid From £ / prices from patterns in that file.
    const text = readFileSync(file, "utf8");
    for (const re of FORBIDDEN) {
      if (re.test(text)) {
        hits.push(`${file.replace(root + "/", "")} matches ${re}`);
      }
    }
  }
}
assert.equal(hits.length, 0, `Forbidden public price marketing:\n${hits.join("\n")}`);
console.log("OK  no public-facing From £ / prices from £ patterns");

console.log("\nNo-public-from-prices checks passed");
