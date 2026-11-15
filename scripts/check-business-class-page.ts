/**
 * Business Class page (/business-class/) checks.
 * Run: npx tsx scripts/check-business-class-page.ts
 *
 * - Every journey purpose the form sends is a valid Business Class service type.
 * - A typical enquiry from the page passes the existing backend validation.
 * - Passenger ceiling (3), return ordering and consent are enforced server-side.
 * - Page copy makes no vehicle-make, fleet or 7-seater claims and invents no reviews.
 * - Every licensed photograph exists in all formats/sizes; placeholders say so.
 * - The page, nav link and sitemap entry stay off unless the build switch is on.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import {
  BUSINESS_CLASS_REQUEST_SERVICE_TYPES,
  validateBespokeQuoteRequest,
} from "../shared/bespoke-quote";
import * as content from "../src/lib/business-class-page-content";

const root = join(__dirname, "..");
let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const formSource = readFileSync(join(root, "src/components/business-class/ExecutiveQuoteForm.tsx"), "utf8");
const pageSource = readFileSync(join(root, "src/app/business-class/page.tsx"), "utf8");

console.log("=== Form → backend mapping ===");
ok("every purpose maps to an allowed Business Class service type", () => {
  const mapped = [...formSource.matchAll(/^\s+(airport|corporate|private|other): "([a-z_]+)",$/gm)].map((m) => m[2]);
  assert.equal(mapped.length, 4, "expected four purpose mappings");
  for (const t of mapped) assert.ok((BUSINESS_CLASS_REQUEST_SERVICE_TYPES as readonly string[]).includes(t), t);
});

const now = new Date("2026-11-16T10:00:00Z");
const base = {
  category: "business_class",
  serviceType: "other",
  customerName: "Alex Example",
  customerEmail: "alex@example.com",
  customerPhone: "07700 900123",
  pickupAddress: "The Merchant Hotel, Skipper Street, Belfast",
  destinationAddress: "Dublin Airport",
  date: "2026-12-02",
  time: "06:30",
  returnJourney: true,
  returnDate: "2026-12-05",
  returnTime: "18:15",
  passengers: 3,
  luggage: "2 large suitcases",
  flightNumber: "EI3327",
  specialRequirements: "Name board please",
  termsAccepted: true,
  privacyAcknowledged: true,
  termsVersion: "test",
};

ok("typical page enquiry (purpose Other, return) validates", () => {
  const r = validateBespokeQuoteRequest(base, now);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
});
ok("each purpose validates", () => {
  for (const serviceType of ["executive_airport", "corporate", "bespoke_private", "other"]) {
    const r = validateBespokeQuoteRequest({ ...base, serviceType }, now);
    assert.ok(r.ok, serviceType);
  }
});
ok("4 passengers rejected (Business Class max 3)", () => {
  const r = validateBespokeQuoteRequest({ ...base, passengers: 4 }, now);
  assert.ok(!r.ok && r.errors.passengers);
});
ok("return before outward rejected", () => {
  const r = validateBespokeQuoteRequest({ ...base, returnDate: "2026-12-02", returnTime: "05:00" }, now);
  assert.ok(!r.ok && r.errors.returnTime);
});
ok("missing consent rejected", () => {
  const r = validateBespokeQuoteRequest({ ...base, termsAccepted: false, privacyAcknowledged: false }, now);
  assert.ok(!r.ok && r.errors.termsAccepted && r.errors.privacyAcknowledged);
});
ok("unknown purpose rejected", () => {
  const r = validateBespokeQuoteRequest({ ...base, serviceType: "limousine" }, now);
  assert.ok(!r.ok && r.errors.serviceType);
});

console.log("=== Copy rules ===");
const copy = JSON.stringify(content) + pageSource + formSource;
ok("no vehicle makes, fleet or 7-seater claims", () => {
  for (const banned of [/mercedes/i, /\bbmw\b/i, /lexus/i, /\bfleet\b/i, /7[- ]?seater/i, /people carrier/i, /chauffeur-qualified/i]) {
    assert.ok(!banned.test(copy), `found ${banned}`);
  }
});
ok("no reviews, ratings or prices on the page", () => {
  for (const banned of [/★/, /review/i, /£\s?\d/]) assert.ok(!banned.test(JSON.stringify(content) + pageSource), `found ${banned}`);
});
ok("required headings present", () => {
  assert.deepEqual(content.BC_HERO.headlineLines, ["Business Class.", "Beyond the Ordinary."]);
  assert.equal(content.BC_INTRO.headline, "A Higher Standard of Travel.");
  assert.equal(content.BC_ENQUIRY.headline, "Your Journey. Exceptionally Considered.");
  assert.equal(content.BUSINESS_CLASS_PAGE_SEO_TITLE, "Business Class & Executive Transfers Belfast | My Airport Taxi NI");
});

console.log("=== Photography ===");
ok("licensed photographs exist in AVIF, WebP and JPEG at every width", () => {
  for (const photo of Object.values(content.BC_PHOTOS)) {
    if (photo.kind !== "licensed") continue;
    for (const w of photo.widths) {
      for (const ext of ["avif", "webp", "jpg"]) {
        const f = join(root, "public", photo.dir ?? "/images/business-class", `${photo.baseName}-${w}.${ext}`);
        assert.ok(existsSync(f), f);
      }
    }
    assert.ok(photo.source && photo.alt.length > 20);
    if (/Representative image/.test(photo.alt) === false) assert.ok(!/saloon|car|vehicle/i.test(photo.alt), "vehicle photos must be marked representative");
  }
});
ok("placeholders are labelled as placeholders, never as licensed", () => {
  const src = readFileSync(join(root, "src/components/business-class/BcPicture.tsx"), "utf8");
  assert.ok(src.includes("Photograph to follow"));
  for (const photo of Object.values(content.BC_PHOTOS)) {
    if (photo.kind === "placeholder") assert.ok(photo.brief.length > 40);
  }
});

console.log("=== Launch switch ===");
ok("page 404s and nav/sitemap stay off unless NEXT_PUBLIC_BESPOKE_PUBLIC_PAGES=1", () => {
  assert.ok(pageSource.includes("if (!BESPOKE_PUBLIC_PAGES_ENABLED) notFound();"));
  const data = readFileSync(join(root, "src/lib/data.ts"), "utf8");
  assert.ok(/businessClassPage: process\.env\.NEXT_PUBLIC_BESPOKE_PUBLIC_PAGES === "1"/.test(data));
  const sitemap = readFileSync(join(root, "scripts/generate-sitemap.mjs"), "utf8");
  const gated = sitemap.slice(sitemap.indexOf("...(BESPOKE_PUBLIC_PAGES_ENABLED"));
  assert.ok(gated.indexOf('"/business-class/"') > 0 && gated.indexOf('"/business-class/"') < gated.indexOf(": []"));
});

console.log(`\nAll ${passed} Business Class page checks passed.`);
