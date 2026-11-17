/**
 * Desktop homepage (owner, 17 Nov 2026): no rotating boxes; more room for the heading and
 * intro; the quote tool lower and bigger. Styling only, homepage only, 1200px+ only.
 * Run: npx tsx scripts/check-homepage-desktop-roomy.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const home = read("src/app/page.tsx");
const hero = read("src/components/HeroSlideshow.tsx");
const css = read("src/app/globals.css");

console.log("=== 1. Rotating boxes are off, on every page ===");
{
  assert.match(home, /<HeroSlideshow homepageQuickPicks desktopRoomy \/>/);
  assert.doesNotMatch(home, /showRotatingCards/, "the homepage no longer asks for the rotating boxes");
  assert.match(hero, /showRotatingCards = false/, "off unless a page asks");
  const identity = read("src/lib/landing-identity.ts");
  assert.doesNotMatch(identity, /showRotatingCards: true/, "no landing page turns them on");
  console.log("OK  no page renders the rotating boxes");
}

console.log("\n=== 2. Wording is unchanged ===");
{
  assert.match(hero, /Belfast &amp; Dublin Airport Transfers/);
  assert.match(hero, /<span data-hero-amp>&amp; <\/span>Premium Private Travel/);
  assert.match(
    hero,
    /Professional, pre-booked airport transfers and private travel across Northern Ireland and beyond\. Whether you’re travelling to the airport, attending an event or planning a longer journey, enjoy comfortable, reliable transport at a fixed price\./,
  );
  const fields = read("src/components/HomepageQuoteFields.tsx");
  assert.match(fields, /"Get Your Fixed Price"/);
  assert.match(fields, /Get My Fixed Price →/);
  console.log("OK  heading, intro, card title and button wording untouched");
}

console.log("\n=== 3. The roomy layout is homepage-only, desktop-only, first step only ===");
{
  assert.match(hero, /data-desktop-roomy=\{desktopRoomy \? "" : undefined\}/);
  const start = css.indexOf("Desktop homepage (≥1200px), first step only (owner, 17 Nov 2026): the rotating");
  assert.ok(start > 0, "roomy block present");
  const block = css.slice(start);
  assert.match(block, /^[^{]*\*\/\s*@media \(min-width: 1200px\) \{\s*@layer base \{/, "wrapped in the 1200px+ media query");
  const scope =
    "html:root:root:root:root:root:root:root:root:not([data-mobile-d3]) main > section.homepage-hero[data-desktop-roomy]:not(:has([data-quote-results], [data-checkout-aside]))";
  const selectorLines = block
    .split("\n")
    .map((line) => line.trim())
    // Every line that opens a rule ("{") or continues a selector list (","), except the @-wrappers.
    .filter((line) => (line.includes("{") || line.endsWith(",")) && !line.startsWith("@") && !line.startsWith("/*"));
  assert.ok(selectorLines.length >= 20, `expected the roomy selectors, found ${selectorLines.length}`);
  for (const line of selectorLines) {
    assert.ok(line.startsWith(scope), `every rule must be scoped to the roomy homepage hero: ${line.slice(0, 120)}`);
  }
  // Outside this block nothing else targets the attribute (so hub pages cannot be affected).
  assert.doesNotMatch(css.slice(0, start), /data-desktop-roomy/);
  console.log(`OK  ${selectorLines.length} selectors, all scoped to section[data-desktop-roomy] before a price is shown`);
}

console.log("\n=== 4. Bigger quote tool ===");
{
  assert.match(css, /--roomy-field: clamp\(3\.5rem, 7\.3vh, 3\.75rem\)/, "boxes and button 56–60px tall (was 50px)");
  assert.match(css, /:not\(:has\(#quote-section-schedule\)\) #passenger-luggage-section > div:nth-child\(1\) \{ grid-column: 1 \/ span 13 !important; \}/);
  assert.match(css, /:not\(:has\(#quote-section-schedule\)\) #passenger-luggage-section > div:nth-child\(2\) \{ grid-column: 14 \/ span 13 !important; \}/);
  console.log("OK  taller boxes; passengers and suitcases line up under the address boxes when there is no date row");
}

console.log("\nAll desktop homepage (roomy) checks passed.");
