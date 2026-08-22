/**
 * Shared hamburger / header navigation scroll system.
 * Run: npx tsx scripts/check-site-nav-scroll.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  SITE_NAV_DESTINATIONS,
  findSiteNavDestination,
  normalizePathname,
  parseSiteNavHref,
} from "../src/lib/site-nav-scroll";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  fn();
  console.log(`OK  ${label}`);
}

const header = read("src/components/Header.tsx");
const siteNav = read("src/lib/site-nav-scroll.ts");
const siteNavLink = read("src/components/SiteNavLink.tsx");
const siteHash = read("src/components/SiteHashScroll.tsx");
const vehicles = read("src/components/VehiclesSection.tsx");
const quoteCard = read("src/components/QuoteCard.tsx");
const layout = read("src/app/layout.tsx");
const scrollJobs = read("src/lib/scroll-jobs.ts");

check("Canonical destinations map covers acceptance matrix", () => {
  const expected = [
    ["Airports", "/#airports", "Airports We Serve"],
    ["Long-Distance Transfers", "/long-distance-transfers/", "Private Long-Distance Transfers from Anywhere in Greater Belfast"],
    ["Locations", "/locations/", "Where we travel"],
    ["Vehicles", "/#vehicles", "Choose by passenger count"],
    ["Check Flights", "/#flight-status", "Check Your Flight"],
    ["Areas We Cover", "/#areas", "Areas We Cover"],
    ["Why Us", "/#why-us", "Why Choose Us"],
    ["FAQ", "/#faq", "Frequently Asked Questions"],
    ["Manage Your Booking", "/manage-booking/", "Manage Your Booking"],
    ["Get a Quote", "/#quote", "Get a Live Quote"],
  ] as const;

  for (const [label, href, heading] of expected) {
    const dest = SITE_NAV_DESTINATIONS.find((d) => d.label === label);
    assert.ok(dest, label);
    assert.equal(dest.href, href);
    assert.equal(dest.heading, heading);
    assert.equal(findSiteNavDestination(href)?.label, label);
  }
});

check("Shared scroll uses measured header + heading, not scrollIntoView", () => {
  assert.match(siteNav, /scheduleSiteNavHeadingScroll/);
  assert.match(siteNav, /computeScrollTopBelowHeader/);
  assert.match(siteNav, /HEADER_CLEARANCE_PX|SITE_NAV_CLEARANCE_PX/);
  assert.match(siteNav, /requestAnimationFrame/);
  assert.match(siteNav, /150/);
  assert.match(siteNav, /focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(siteNav, /scrollIntoView/);
  assert.match(siteNavLink, /navigateSiteNav/);
  assert.match(siteNavLink, /preventDefault/);
  assert.match(siteNavLink, /scroll=\{false\}/);
});

check("Header / hamburger uses SiteNavLink and closes menu first", () => {
  assert.match(header, /SiteNavLink/);
  assert.match(header, /onNavigate=\{closeMenu\}/);
  assert.match(header, /aria-expanded=\{menuOpen\}/);
  assert.match(header, /body\.style\.overflow = "hidden"/);
  assert.match(header, /window\.scrollTo\(0, scrollY\)/);
});

check("Vehicles has scroll-mt fallback and data-site-nav-heading", () => {
  assert.match(vehicles, /id="vehicles"/);
  assert.match(vehicles, /scroll-mt-36/);
  assert.match(vehicles, /xl:scroll-mt-28/);
  assert.match(vehicles, /navId="vehicles"/);
  assert.match(quoteCard, /data-site-nav-heading="quote"/);
  assert.match(read("src/components/AirportsSection.tsx"), /navId="airports"/);
});

check("SiteHashScroll handles pending cross-page + hashchange + popstate", () => {
  assert.match(layout, /SiteHashScroll/);
  assert.match(siteHash, /readPendingSiteNav/);
  assert.match(siteHash, /hashchange/);
  assert.match(siteHash, /popstate/);
  assert.match(siteHash, /scrollRestoration/);
  assert.match(siteNav, /writePendingSiteNav/);
  assert.match(siteNav, /location\.assign\(parsed\.pathname\)/);
});

check("Competing quote scrolls are cancelled for menu navigation", () => {
  assert.match(scrollJobs, /cancelCompetingScrollJobs/);
  assert.match(siteNav, /cancelCompetingScrollJobs/);
  assert.match(read("src/lib/quote-step-nav-scroll.ts"), /trackScrollJob/);
  assert.match(read("src/lib/quote-step-nav-scroll.ts"), /isScrollJobGenerationCurrent/);
});

check("parse / normalize helpers", () => {
  assert.equal(normalizePathname("/locations"), "/locations/");
  assert.equal(normalizePathname("/"), "/");
  assert.equal(parseSiteNavHref("/#vehicles").hash, "vehicles");
  assert.equal(parseSiteNavHref("/manage-booking/").hash, null);
});

console.log("\nLanding positions (heading targets):");
for (const dest of SITE_NAV_DESTINATIONS) {
  console.log(`  ${dest.label} → ${dest.href} → “${dest.heading}”`);
}

console.log("\nAll site-nav scroll checks passed.");
