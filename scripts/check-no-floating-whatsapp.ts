/**
 * No floating WhatsApp on mobile — mobile uses the Header quick-row icon.
 * Desktop: floating WhatsApp button (bottom-right) with a QR code panel.
 * WhatsApp assistant links pre-fill the journey being quoted.
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
assert.match(quoteHelp, /Need help\?/);
assert.match(quoteHelp, /WhatsApp us/);
assert.match(quoteHelp, /useWhatsAppAssistantHref\(\)/);
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
// Assistant buttons fall back to the business number while the assistant is switched off.
assert.match(data, /whatsappAssistantLive:\s*(true|false)/);
assert.match(contact, /SITE\.whatsappAssistantLive \? SITE\.whatsappAssistant : SITE\.whatsapp/);
assert.match(data, /whatsapp:\s*"447549815538"/);
assert.match(data, /whatsappUsername:\s*"belfasttaxi"/);
assert.match(data, /whatsappDefaultMessage/);

// Desktop-only floating WhatsApp (QR + open link), rendered from the root layout.
const qr = read("src/components/WhatsAppQrLauncher.tsx");
assert.match(layout, /<WhatsAppQrFloating \/>/);
assert.match(qr, /isMobile !== false/);
assert.match(qr, /shouldHidePublicSalesWidgets\(pathname\)/);
assert.match(qr, /--matni-cookie-banner-offset/);
assert.match(qr, /data-matni-whatsapp-qr-launcher/);
assert.match(qr, /QRCode\.toString\(href/);
assert.match(qr, /useWhatsAppAssistantHref\(\)/);
assert.match(qr, /SITE\.whatsappAssistantDisplay/);

// Journey pre-fill: QuoteCard publishes, header / Need help? / QR read it.
const journeyCtx = read("src/lib/whatsapp-journey-context.ts");
const quoteCard = read("src/components/QuoteCard.tsx");
assert.match(quoteCard, /setWhatsAppJourney\(\{/);
assert.match(quoteCard, /setWhatsAppJourney\(null\)/);
assert.match(header, /useWhatsAppAssistantHref\(\)/);
assert.match(journeyCtx, /From: \$\{journey\.pickup/);

console.log("OK  no floating WhatsApp on mobile; desktop floating WhatsApp with QR");
console.log("OK  mobile WhatsApp in Header quick row");
console.log("OK  desktop uses exclusive ? help (QuoteAssistant)");
console.log("OK  secondary WhatsApp: menu, footer, Need help under quote");
console.log("\nAll no-floating-whatsapp checks passed.");
