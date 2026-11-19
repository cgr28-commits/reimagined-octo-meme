/**
 * Airport guide pages: Design 3 phone banner / tablet photo hero (owner, 19 Nov 2026).
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
  assert.match(photo, /max-width: 767\.98px/);
  assert.match(photo, /max-width: 1199\.98px/);
  assert.match(photo, /src=\{TRANSPARENT_PIXEL\}/);
  assert.match(photo, /alt=""/);

  const hero = read("src/components/HeroSlideshow.tsx");
  assert.match(hero, /airportPhoto \?/);
  assert.match(hero, /"belfast-international-homepage"/);

  const css = read("src/app/airport-page-hero.css");
  for (const block of css.match(/@media[^{]+/g) ?? []) {
    assert.match(block, /max-width: (767|1199)\.98px/, `unexpected media query: ${block}`);
  }
  assert.match(css, /:not\(:has\(\[data-quote-results\], \[data-checkout-aside\]\)\)/);
  assert.match(read("src/app/layout.tsx"), /import "\.\/airport-page-hero\.css";/);
  console.log("OK  phones/tablets only; hidden once results or checkout show");
}

console.log("=== Credits ===");
{
  const credits = read("src/app/photo-credits/page.tsx");
  for (const source of [
    "BFS_airport_terminal_(Image_copyright_Andrew_McCarron).jpg",
    "Entrance_to_George_Best_Belfast_City_Airport_-_geograph.org.uk_-_3145806.jpg",
    "File:CODA.jpg",
    "Dublin_Airport_Terminal_2_-_2024-05-18.jpg",
  ]) {
    assert.ok(credits.includes(source), `photo-credits missing ${source}`);
  }
  console.log("OK  /photo-credits/ lists all four airport photographs");
}

console.log("\nAll airport page hero checks passed.");
