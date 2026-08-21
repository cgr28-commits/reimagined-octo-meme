/**
 * Public site: desktop round “?” vs mobile Header WhatsApp (exclusive).
 * Run: npx tsx scripts/check-public-help-fabs.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const assistant = read("src/components/QuoteAssistant.tsx");
const wa = read("src/components/WhatsAppButton.tsx");
const hero = read("src/components/HeroSlideshow.tsx");
const header = read("src/components/Header.tsx");
const contact = read("src/lib/contact-card.ts");
const data = read("src/lib/data.ts");
const layout = read("src/app/layout.tsx");
const device = read("src/lib/device.ts");

console.log("=== 1. Desktop round ? help button ===");
{
  assert.match(assistant, /data-matni-help-launcher/);
  assert.match(assistant, /h-\[50px\]/);
  assert.match(assistant, /w-\[50px\]/);
  assert.match(assistant, /rounded-full/);
  assert.match(assistant, /border-emerald/);
  assert.match(assistant, /bg-navy/);
  assert.match(assistant, />\s*\?\s*</);
  assert.match(assistant, /position:\s*"fixed"/);
  assert.match(assistant, /createPortal\(ui, document\.body\)/);
  assert.match(assistant, /isMobile !== false/);
  assert.doesNotMatch(assistant, /Can I help \?/);
  assert.doesNotMatch(assistant, /Need help\?/);
  assert.doesNotMatch(assistant, /rounded-2xl py-2 pl-2 pr-3/);
  console.log("OK  50px circle ? · fixed · desktop-only");
}

console.log("\n=== 2. Mobile WhatsApp in Header quick row ===");
{
  assert.match(header, /data-matni-whatsapp-quick/);
  assert.match(header, /h-7 w-7/);
  assert.match(header, /#25D366/);
  assert.match(header, /whatsAppChatUrl/);
  assert.match(header, /Hi, I need some help with an airport transfer/);
  assert.match(wa, /return null/);
  assert.doesNotMatch(layout, /<WhatsAppButton/);
  assert.doesNotMatch(hero, /data-matni-whatsapp/);
  console.log("OK  Header quick-row WhatsApp · no floating FAB · outside quote");
}

console.log("\n=== 3. Exclusive breakpoint (never both) ===");
{
  assert.match(device, /min-width: 768px/);
  assert.match(assistant, /isMobile !== false/);
  assert.match(layout, /QuoteAssistant/);
  assert.doesNotMatch(layout, /<WhatsAppButton/);
  console.log("OK  ≥768px ? only · <768px Header WhatsApp only");
}

console.log("\n=== 4. Hero CTAs removed · Live Quote untouched · nav Quote kept ===");
{
  assert.doesNotMatch(hero, /Get a Fixed Quote/);
  assert.doesNotMatch(hero, /Book Your Transfer/);
  assert.match(hero, /id="quote"/);
  assert.match(hero, /<QuoteCard/);
  assert.match(header, /Get a Quote/);
  assert.match(contact, /export function whatsAppChatUrl/);
  assert.match(data, /whatsapp:\s*"447549815538"/);
  console.log("OK  hero cleanup · quote panel primary · header CTA");
}

console.log("\nAll public help FAB checks passed.");
