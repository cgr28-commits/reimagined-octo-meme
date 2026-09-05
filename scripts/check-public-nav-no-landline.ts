/**
 * Public chrome must not show a prominent landline Call CTA.
 * Mobile menu keeps Get a Quote, WhatsApp @belfasttaxi, Contact, Manage Your Booking.
 * Run: npx tsx scripts/check-public-nav-no-landline.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const header = read("src/components/Header.tsx");
const footer = read("src/components/FooterContact.tsx");
const contact = read("src/app/contact/ContactCardClient.tsx");
const contactPage = read("src/app/contact/page.tsx");
const quoteHelp = read("src/components/QuoteHelpContact.tsx");
const holding = read("src/components/HoldingPage.tsx");
const track = read("src/app/track/page.tsx");
const data = read("src/lib/data.ts");
const terms = read("src/app/terms/page.tsx");
const emails = read("shared/booking-notifications.ts");

console.log("=== Public navigation has no landline Call CTA ===");

const navStart = header.indexOf('aria-label="Mobile navigation"');
assert.ok(navStart > 0, "mobile navigation landmark");
const navEnd = header.indexOf("</nav>", navStart);
assert.ok(navEnd > navStart, "mobile navigation closes");
const mobileNav = header.slice(navStart, navEnd);

for (const required of [
  "Get a Quote",
  "WhatsApp @{SITE.whatsappUsername}",
  "Manage Your Booking",
  'href="/contact/"',
]) {
  assert.ok(mobileNav.includes(required), `mobile menu must contain ${required}`);
}
assert.match(mobileNav, /href="\/contact\/"[\s\S]*?\n\s*Contact\n/);
assert.match(data, /whatsappUsername:\s*"belfasttaxi"/);

assert.doesNotMatch(mobileNav, /tel:/);
assert.doesNotMatch(mobileNav, /Call \{SITE\.landlineDisplay\}/);
assert.doesNotMatch(mobileNav, /028 9602 2952/);
assert.doesNotMatch(mobileNav, /02896022952/);
assert.doesNotMatch(header, /href=\{`tel:\$\{SITE\.landline\}`\}/);
assert.doesNotMatch(header, /Call \{SITE\.landlineDisplay\}/);

const desktopCtasStart = header.indexOf("Desktop/laptop CTAs");
assert.ok(desktopCtasStart > 0);
const desktopCtas = header.slice(desktopCtasStart, header.indexOf("Mobile only", desktopCtasStart));
assert.match(desktopCtas, /Get a Quote/);
assert.match(desktopCtas, /Manage Your Booking/);
assert.doesNotMatch(desktopCtas, /tel:/);
assert.doesNotMatch(desktopCtas, /Call /);
console.log("OK  mobile + desktop nav keep Quote / WhatsApp / Contact / Manage Booking; no Call CTA");

assert.doesNotMatch(footer, /tel:/);
assert.doesNotMatch(footer, /landlineDisplay|028 9602 2952|Business Line/);
assert.match(footer, /WhatsApp @\{SITE\.whatsappUsername\}/);
assert.match(footer, /SITE\.email/);
console.log("OK  footer has email + WhatsApp, no landline");

assert.doesNotMatch(contact, /tel:/);
assert.doesNotMatch(contact, /landlineDisplay|028 9602 2952/);
assert.match(contact, /Get a quote/);
assert.match(contact, /whatsAppChatUrl\(\)/);
assert.match(contact, /@\{SITE\.whatsappUsername\}/);
assert.doesNotMatch(contactPage, /Call \$\{SITE\.landlineDisplay\}/);
console.log("OK  Contact page has quote + WhatsApp, no landline CTA");

assert.doesNotMatch(quoteHelp, /tel:/);
assert.doesNotMatch(quoteHelp, /landlineDisplay|028 9602 2952/);
assert.match(quoteHelp, /WhatsApp us/);
assert.doesNotMatch(holding, /tel:/);
assert.doesNotMatch(holding, /Call \{SITE\.landlineDisplay\}/);
assert.match(holding, /WhatsApp @\{SITE\.whatsappUsername\}/);
assert.doesNotMatch(track, /Or call \{SITE\.landlineDisplay\}/);
console.log("OK  quote help, holding page, and track page have no landline CTA");

assert.match(data, /landline:\s*"\+442896022952"/);
assert.match(data, /landlineDisplay:\s*"028 9602 2952"/);
assert.match(terms, /BUSINESS_LEGAL\.phoneDisplay/);
assert.match(emails, /BUSINESS_PHONE_DISPLAY/);
console.log("OK  landline remains in site data, legal, and booking emails");

console.log("\nAll public-nav no-landline checks passed.");
