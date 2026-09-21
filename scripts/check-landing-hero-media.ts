/**
 * Landing pages: collapse empty hero media; keep real photos; shared top spacing.
 * Run: npx tsx scripts/check-landing-hero-media.ts
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import LandingHeroMedia from "../src/components/LandingHeroMedia";
import { LANDING_PAGE_MAIN_CLASS } from "../src/lib/landing-page-layout";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

console.log("=== Shared landing shell ===");
{
  assert.match(LANDING_PAGE_MAIN_CLASS, /pt-20/);
  assert.match(LANDING_PAGE_MAIN_CLASS, /md:pt-28/);
  assert.doesNotMatch(LANDING_PAGE_MAIN_CLASS, /pt-36/);
  assert.doesNotMatch(LANDING_PAGE_MAIN_CLASS, /xl:pt-/);
  assert.doesNotMatch(LANDING_PAGE_MAIN_CLASS, /min-h-\[|h-\[|svh|dvh|vh/);
  console.log("OK  mobile clearance is pt-20; desktop stays md:pt-28");
}

console.log("=== No-image hero renders no spacer ===");
{
  const empty = renderToStaticMarkup(createElement(LandingHeroMedia));
  assert.equal(empty, "", "missing image must not reserve a hero frame");

  const missingAlt = renderToStaticMarkup(
    createElement(LandingHeroMedia, { baseName: "belfast-international" }),
  );
  assert.equal(missingAlt, "", "image without alt must not reserve a hero frame");
  console.log("OK  LandingHeroMedia collapses when no photo is configured");
}

console.log("=== Image hero keeps media and aspect frame ===");
{
  const html = renderToStaticMarkup(
    createElement(LandingHeroMedia, {
      baseName: "belfast-international",
      alt: "Belfast International Airport terminal",
    }),
  );
  assert.match(html, /data-landing-hero/);
  assert.match(html, /h-56 overflow-hidden sm:h-72/);
  assert.match(html, /belfast-international-1920\.jpg/);
  assert.match(html, /Belfast International Airport terminal/);
  assert.doesNotMatch(html, /min-h-screen|min-h-\[|100vh|100svh|100dvh/);

  const airport = renderToStaticMarkup(
    createElement(LandingHeroMedia, {
      baseName: "belfast-city",
      alt: "George Best Belfast City Airport",
      variant: "airport",
    }),
  );
  assert.match(airport, /h-64 overflow-hidden sm:h-80 lg:h-\[22rem\]/);
  assert.match(airport, /belfast-city-1920\.jpg/);
  console.log("OK  configured photos keep their existing mobile/desktop frames");
}

console.log("=== Public conversion templates share the layout ===");
{
  const pages = [
    "src/app/belfast-cruise-terminal-transfers/page.tsx",
    "src/app/airports/page.tsx",
    "src/app/airports/[slug]/page.tsx",
    "src/app/locations/page.tsx",
    "src/app/locations/[slug]/page.tsx",
    "src/app/transfers/[slug]/page.tsx",
    "src/app/long-distance-transfers/page.tsx",
  ];
  for (const rel of pages) {
    const source = read(rel);
    assert.match(source, /LANDING_PAGE_MAIN_CLASS/, rel);
    assert.doesNotMatch(source, /pt-36 md:pt-28/, rel);
    assert.doesNotMatch(source, /-mt-\[|transform:|-translate-y/, rel);
  }

  const cruise = read("src/app/belfast-cruise-terminal-transfers/page.tsx");
  assert.doesNotMatch(cruise, /LandingHeroMedia|h-56 overflow-hidden|OptimizedHeroPicture/);
  assert.match(cruise, /LandingPageStickyQuoteCta/);
  assert.doesNotMatch(cruise, /LocationQuoteSection/);

  const townHub = read("src/app/locations/[slug]/page.tsx");
  assert.match(townHub, /<LandingHeroMedia baseName=\{page\.heroBase\} alt=\{page\.heroAlt\}/);
  assert.doesNotMatch(townHub, /absolute inset-0 bg-gradient-to-b from-navy-light/);

  const airport = read("src/app/airports/[slug]/page.tsx");
  assert.match(airport, /variant="airport"/);

  const transfer = read("src/app/transfers/[slug]/page.tsx");
  assert.match(transfer, /page\.airport\.heroBase/);
  assert.match(transfer, /LandingHeroMedia/);

  const homepage = read("src/app/page.tsx");
  const hero = read("src/components/HeroSlideshow.tsx");
  assert.doesNotMatch(homepage, /LANDING_PAGE_MAIN_CLASS|LandingHeroMedia|LandingPageStickyQuoteCta/);
  assert.doesNotMatch(hero, /LANDING_PAGE_MAIN_CLASS|LandingHeroMedia|data-landing-hero/);
  assert.match(hero, /pt-\[4\.15rem\] md:pt-28/);
  console.log("OK  conversion landings share the shell; homepage hero stays separate");
}

console.log("\nAll landing hero media checks passed.");
