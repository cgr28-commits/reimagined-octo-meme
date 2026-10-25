/**
 * Mobile uses a floating WhatsApp button (WhatsAppButton); the header no longer
 * carries a WhatsApp icon. Desktop uses the round “?” help button.
 * (File name kept for history: the FAB was removed once, then brought back.)
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
assert.match(wa, /md:hidden/);
assert.match(layout, /<WhatsAppButton \/>/);

assert.doesNotMatch(header, /data-matni-whatsapp-quick/);
assert.match(assistant, /isMobile !== false/);

assert.match(hero, /QuoteHelpContact/);
assert.doesNotMatch(hero, /data-matni-whatsapp/);

const quoteHelp = read("src/components/QuoteHelpContact.tsx");
assert.match(quoteHelp, /Need help\?/);
assert.match(quoteHelp, /WhatsApp us/);
assert.match(quoteHelp, /whatsAppChatUrl\(\)/);
assert.doesNotMatch(quoteHelp, /Call \{SITE\.landlineDisplay\}/);
assert.doesNotMatch(quoteHelp, /tel:\$\{SITE\.landline\}/);
assert.doesNotMatch(quoteHelp, /028 9602 2952|landlineDisplay/);
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

console.log("OK  mobile floating WhatsApp button");
console.log("OK  no WhatsApp icon in the mobile header row");
console.log("OK  desktop uses exclusive ? help (QuoteAssistant)");
console.log("OK  secondary WhatsApp: menu, footer, Need help under quote");
console.log("\nAll mobile WhatsApp button checks passed.");
