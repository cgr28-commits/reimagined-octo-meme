/**
 * Floating WhatsApp FAB must not obstruct the homepage / Get a Quote funnel.
 * Run: npx tsx scripts/check-no-floating-whatsapp.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const wa = read("src/components/WhatsAppButton.tsx");
const hero = read("src/components/HeroSlideshow.tsx");
const header = read("src/components/Header.tsx");
const footer = read("src/components/FooterContact.tsx");
const contact = read("src/lib/contact-card.ts");
const data = read("src/lib/data.ts");
const layout = read("src/app/layout.tsx");

assert.match(wa, /return null/);
assert.doesNotMatch(wa, /fixed bottom-|z-\[60\]|z-\[40\]/);
assert.match(layout, /WhatsAppButton/);

assert.match(hero, /Need help\?/);
assert.match(hero, /WhatsApp us/);
assert.match(hero, /whatsAppChatUrl\(\)/);
assert.doesNotMatch(hero, /fixed bottom-/);

assert.match(header, /WhatsApp @\{SITE\.whatsappUsername\}/);
assert.match(header, /whatsAppChatUrl\(\)/);
assert.match(header, /href="\/contact\/"/);

assert.match(footer, /WhatsApp @\{SITE\.whatsappUsername\}/);
assert.match(footer, /whatsAppChatUrl\(\)/);

assert.match(contact, /export function whatsAppChatUrl/);
assert.match(data, /whatsapp:\s*"447549815538"/);
assert.match(data, /whatsappUsername:\s*"belfasttaxi"/);
assert.match(data, /whatsappDefaultMessage/);

console.log("OK  floating WhatsApp FAB disabled");
console.log("OK  secondary WhatsApp: menu, footer, Need help under quote");
console.log("OK  number/username + default message preserved");
console.log("\nAll no-floating-whatsapp checks passed.");
