/**
 * Airport guide pages: homepage-style Design 3 phone hero / tablet photo hero (owner, 19 Nov 2026).
 * Only the four /airports/* pages use it; desktop and the other quote pages are unchanged.
 * Run: npx tsx scripts/check-airport-page-hero.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AIRPORT_PAGE_HERO } from "../src/lib/airport-page-hero";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

console.log("=== Images exist and stay within the size budget ===");
{
  const budgetKb = { phone: 35, tablet: 60 } as const;
  for (const [code, hero] of Object.entries(AIRPORT_PAGE_HERO)) {
    assert.match(hero.badge, new RegExp(`^${code} · `));
    for (const variant of ["phone", "tablet"] as const) {
      for (const ext of ["avif", "webp", "jpg"]) {
        const file = join(root, "public/images/hero/optimized", `${hero.baseName}-${variant}.${ext}`);
        assert.ok(existsSync(file), `missing ${file}`);
        if (ext === "avif") {
          const kb = statSync(file).size / 1024;
          assert.ok(kb <= budgetKb[variant], `${hero.baseName}-${variant}.avif is ${kb.toFixed(1)} KB`);
        }
      }
    }
  }
  console.log("OK  BFS/BHD/DUB/LDY phone and tablet images exist; AVIF within budget");
}

console.log("=== Only the four airport guide pages use it ===");
{
  const users: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(root, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(name) && /airportPhoto=/.test(read(rel))) users.push(rel);
    }
  };
  walk("src");
  assert.deepEqual(users, ["src/app/airports/[slug]/page.tsx"]);

  const airport = read("src/app/airports/[slug]/page.tsx");
  assert.match(airport, /airportPhoto=\{AIRPORT_PAGE_HERO\[page\.code\]\}/);
  assert.match(airport, /variant="airport" loadFromMinWidth=\{1200\}/);
  console.log("OK  airportPhoto is passed only by /airports/[slug]");
}

console.log("=== Desktop never downloads it; hero keeps its default elsewhere ===");
{
  const photo = read("src/components/AirportPageHeroPhoto.tsx");
  assert.match(photo, /"\(max-width: 767\.98px\)"/);
  assert.match(photo, /"\(min-width: 768px\) and \(max-width: 1199\.98px\)"/);
  assert.match(photo, /src=\{TRANSPARENT_PIXEL\}/);
  assert.match(photo, /alt=""/);

  const hero = read("src/components/HeroSlideshow.tsx");
  assert.match(hero, /airportPhoto \?/);
  assert.match(hero, /"belfast-international-homepage"/);
  assert.match(hero, /data-airport-page=\{airportPhoto \? "" : undefined\}/);
  assert.match(hero, /homepageQuickPicks=\{homepageQuickPicks \? true : airportPhoto \? "phone-tablet" : false\}/);

  const css = read("src/app/airport-page-hero.css");
  for (const block of css.match(/@media[^{]+/g) ?? []) {
    assert.match(block, /max-width: (767|1199)\.98px/, `unexpected media query: ${block}`);
  }
  assert.match(css, /:not\(:has\(\[data-quote-results\], \[data-checkout-aside\]\)\)/);
  assert.match(read("src/app/layout.tsx"), /import "\.\/airport-page-hero\.css";/);
  console.log("OK  phones/tablets only; hidden once results or checkout show");
}

console.log("=== Homepage phone layout shared; desktop card unchanged ===");
{
  const mockup = read("src/app/mobile-home-mockup.css");
  assert.match(mockup, /section\.homepage-hero:is\(\[data-desktop-roomy\], \[data-airport-page\]\)/);
  assert.match(
    mockup,
    /section\.homepage-hero\[data-desktop-roomy\]:not\([^{]*\)::before \{[^}]*mobile-dublin-airport-dusk/,
    "the homepage's AI-generated Dublin photo stays homepage-only",
  );

  const fields = read("src/components/HomepageQuoteFields.tsx");
  assert.match(fields, /desktopQuickPicks = quickPicks/);
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /desktopQuickPicks=\{homepageQuickPicks === true\}/);

  const css = read("src/app/airport-page-hero.css");
  assert.match(
    css,
    /@layer base \{\s*@media \(min-width: 768px\) and \(max-width: 1199\.98px\) \{[\s\S]*?\[data-airport-page\] #quote#quote#quote \[data-quick-picks\] \{\s*display: none !important;/,
    "tablets keep the form without the airport chips",
  );
  console.log("OK  phones share the homepage rules; desktop title and tablet form unchanged");
}

console.log("=== Credits ===");
{
  const credits = read("src/app/photo-credits/page.tsx");
  // BFS, BHD and DUB use owner-supplied images (no third-party credit); Derry is from Commons.
  for (const source of ["File:CODA.jpg", "Dublin_Airport_Terminal_2_-_2024-05-18.jpg"]) {
    assert.ok(credits.includes(source), `photo-credits missing ${source}`);
  }
  for (const owner of ["bfs", "bhd", "dub"]) {
    assert.ok(existsSync(join(root, `design/airport-page-heroes/${owner}-owner.jpg`)), `missing ${owner} original`);
  }
  console.log("OK  /photo-credits/ lists the Commons photographs; owner originals are kept");
}

console.log("\nAll airport page hero checks passed.");
