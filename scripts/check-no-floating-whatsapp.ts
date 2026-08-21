/**
 * Floating WhatsApp is mobile-only; desktop uses the round “?” help button.
 * Secondary WhatsApp links (menu/footer/Need help) remain.
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
const assistant = read("src/components/QuoteAssistant.tsx");

assert.match(wa, /data-matni-whatsapp-fab/);
assert.match(wa, /isMobile !== true/);
assert.match(layout, /WhatsAppButton/);
assert.match(assistant, /isMobile !== false/);

assert.match(hero, /Need help\?/);
assert.match(hero, /WhatsApp us/);
assert.match(hero, /whatsAppChatUrl\(\)/);
assert.doesNotMatch(hero, /data-matni-whatsapp-fab/);

assert.match(header, /WhatsApp @\{SITE\.whatsappUsername\}/);
assert.match(header, /whatsAppChatUrl\(\)/);
assert.match(header, /href="\/contact\/"/);

assert.match(footer, /WhatsApp @\{SITE\.whatsappUsername\}/);
assert.match(footer, /whatsAppChatUrl\(\)/);

assert.match(contact, /export function whatsAppChatUrl/);
assert.match(data, /whatsapp:\s*"447549815538"/);
assert.match(data, /whatsappUsername:\s*"belfasttaxi"/);
assert.match(data, /whatsappDefaultMessage/);

console.log("OK  floating WhatsApp is mobile-only FAB");
console.log("OK  desktop uses exclusive ? help (QuoteAssistant)");
console.log("OK  secondary WhatsApp: menu, footer, Need help under quote");
console.log("\nAll no-floating-whatsapp checks passed.");
