/**
 * Floating WhatsApp FAB removed — mobile uses Header quick-row icon.
 * Desktop uses the round “?” help button.
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

assert.match(wa, /return null/);
assert.doesNotMatch(wa, /createPortal/);
assert.doesNotMatch(wa, /data-matni-whatsapp-fab/);
assert.doesNotMatch(layout, /<WhatsAppButton/);

assert.match(header, /data-matni-whatsapp-quick/);
assert.match(assistant, /isMobile !== false/);

assert.match(hero, /QuoteHelpContact/);
assert.doesNotMatch(hero, /data-matni-whatsapp/);

const quoteHelp = read("src/components/QuoteHelpContact.tsx");
assert.match(quoteHelp, /Need help\? Contact us via/);
assert.match(quoteHelp, /whatsAppChatUrl\(\)/);
assert.match(quoteHelp, /mailto:\$\{SITE\.email\}/);
assert.doesNotMatch(quoteHelp, /tel:/);
assert.doesNotMatch(quoteHelp, /landlineDisplay|028 9602 2952|Call Us|Business Line/);
assert.doesNotMatch(quoteHelp, /btn-primary|btn-secondary|min-h-11/);

assert.match(header, /WhatsApp @\{SITE\.whatsappUsername\}/);
assert.match(header, /whatsAppChatUrl/);
assert.match(header, /href="\/contact\/"/);

assert.match(footer, /WhatsApp @\{SITE\.whatsappUsername\}/);
assert.match(footer, /whatsAppChatUrl\(\)/);

assert.match(contact, /export function whatsAppChatUrl/);
assert.match(data, /whatsapp:\s*"447549815538"/);
assert.match(data, /whatsappUsername:\s*"belfasttaxi"/);
assert.match(data, /whatsappDefaultMessage/);

console.log("OK  no floating WhatsApp FAB");
console.log("OK  mobile WhatsApp in Header quick row");
console.log("OK  desktop uses exclusive ? help (QuoteAssistant)");
console.log("OK  secondary WhatsApp: menu, footer, Need help under quote");
console.log("\nAll no-floating-whatsapp checks passed.");
