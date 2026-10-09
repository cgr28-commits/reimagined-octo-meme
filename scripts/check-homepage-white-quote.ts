/**
 * Homepage-only white quote experiment.
 * Run: npx tsx scripts/check-homepage-white-quote.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
const hero = readFileSync(join(root, "src/components/HeroSlideshow.tsx"), "utf8");
const card = readFileSync(join(root, "src/components/QuoteCard.tsx"), "utf8");
const dublin = readFileSync(
  join(root, "src/app/transfers/business-class-dublin-airport/page.tsx"),
  "utf8",
);

const experiment = css.slice(css.indexOf("Homepage quote experiment only"));
assert.ok(experiment.length > 0, "homepage white quote block exists");
assert.match(experiment, /\.homepage-hero \.quote-flow\[data-quote-presentation="homepage"\]/);
assert.match(experiment, /background: #ffffff/);
assert.match(experiment, /color: #071c38/);
assert.match(experiment, /#f8fafc/);
assert.match(experiment, /#eefaf1/);
assert.match(experiment, /#2fbf4a/);
assert.match(experiment, /#5b6b7c/);
assert.match(experiment, /@layer base/);
assert.match(
  experiment,
  /\.homepage-hero \.quote-flow\[data-quote-presentation="homepage"\] \.form-label \{\s*color: #071c38 !important;/,
);
assert.match(css, /--quote-card-bg: rgba\(16, 46, 82, 0\.94\)/);
assert.match(css, /--quote-secondary-ink: #c8d3df/);
assert.match(hero, /presentation="homepage"/);
assert.match(card, /quote-flow glass-card/);
assert.doesNotMatch(dublin, /data-quote-presentation="homepage"/);
assert.doesNotMatch(card, /background: #ffffff/);

console.log("OK  white quote colours are scoped to the homepage quote tool");
