/**
 * Prevent the retired business landline from returning in customer-facing output.
 * Run: npx tsx scripts/check-no-public-landline.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildCustomerConfirmationEmail } from "../shared/booking-notifications";
import { CONTACT_VCARD } from "../shared/contact-vcard";
import { getLocalBusinessJsonLd, getServiceAreaJsonLd } from "../src/lib/structured-data";

const root = process.cwd();

const FORBIDDEN = [
  /028\s*9602\s*2952/,
  /02896022952/,
  /\+442896022952/,
  /442896022952/,
  /Business Line/,
  /Call Us/,
];

const SCAN_DIRS = [
  "src",
  "shared",
  "workers/addresses/shared",
  "public",
];

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  "partners",
]);

const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".html",
  ".vcf",
  ".json",
]);

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
      continue;
    }
    const ext = name.slice(name.lastIndexOf("."));
    if (SCAN_EXTENSIONS.has(ext)) files.push(full);
  }
  return files;
}

console.log("=== Customer-facing landline scan ===");
const hits: string[] = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(root, dir))) {
    const rel = relative(root, file);
    const text = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN) {
      if (pattern.test(text)) {
        hits.push(`${rel} matches ${pattern}`);
      }
    }
  }
}
assert.equal(hits.length, 0, `public landline leaked:\n${hits.join("\n")}`);
console.log("OK  no landline, tel:+442896022952, Call Us, or Business Line in customer-facing trees");

console.log("\n=== Structured data omits telephone ===");
{
  const local = getLocalBusinessJsonLd() as Record<string, unknown>;
  const contact = local.contactPoint as Record<string, unknown>;
  assert.equal(Object.prototype.hasOwnProperty.call(local, "telephone"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(contact, "telephone"), false);
  assert.equal(local.email, "bookings@myairporttaxini.co.uk");
  assert.equal(contact.email, "bookings@myairporttaxini.co.uk");
  assert.equal(local.name, "My Airport Taxi NI");
  assert.equal(local.url, "https://www.myairporttaxini.co.uk");

  const service = getServiceAreaJsonLd({
    name: "Belfast International Airport transfers",
    description: "Airport transfers",
    path: "/airports/belfast-international/",
    areaServed: ["Belfast"],
  }) as Record<string, unknown>;
  const serviceContact = service.contactPoint as Record<string, unknown>;
  assert.equal(Object.prototype.hasOwnProperty.call(service, "telephone"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(serviceContact, "telephone"), false);
  assert.equal(service.email, "bookings@myairporttaxini.co.uk");
  console.log("OK  LocalBusiness / TaxiService keep identity fields and omit telephone");
}

console.log("\n=== Customer confirmation email + vCard ===");
{
  const email = buildCustomerConfirmationEmail({
    customerName: "Alex Example",
    customerEmail: "alex@example.com",
    mobileNumber: "07123456789",
    tripLabel: "Home → BFS",
    pickupLabel: "Home",
    dropoffLabel: "Belfast International Airport",
    returnJourney: false,
    tripDate: "2026-09-10",
    tripTime: "10:00",
    returnDate: "",
    returnTime: "",
    flightNumber: "EZY123",
    passengers: 2,
    suitcases: 2,
    vehicle: "Estate Car (1–4 passengers)",
    isAirportTrip: true,
    airportCode: "BFS",
    amountPaid: "£45.00",
    paymentReference: "T3TESTREF",
    checkoutReference: "matni-test-ref",
  });
  assert.match(email.text, /07123456789/);
  assert.match(email.html, /07123456789/);
  assert.match(email.text, /bookings@myairporttaxini\.co\.uk/);
  assert.doesNotMatch(email.text, /028\s*9602\s*2952|tel:/);
  assert.doesNotMatch(email.html, /028\s*9602\s*2952|tel:/);
  assert.doesNotMatch(CONTACT_VCARD, /TEL;|028\s*9602\s*2952|\+442896022952/);
  console.log("OK  customer mobile kept; business landline absent from email and vCard");
}

console.log("\nAll public landline checks passed.");
