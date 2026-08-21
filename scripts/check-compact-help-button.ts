/**
 * Public Help launcher — fixed to the viewport, visible on first paint.
 * Run: npx tsx scripts/check-compact-help-button.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const assistant = read("src/components/QuoteAssistant.tsx");
const css = read("src/app/globals.css");
const hero = read("src/components/HeroSlideshow.tsx");
const locationQuote = read("src/components/LocationQuoteSection.tsx");
const wa = read("src/components/WhatsAppButton.tsx");
const layout = read("src/app/layout.tsx");

console.log("=== 1. Compact Help style (not large card) ===");
{
  assert.match(assistant, /data-matni-help-launcher/);
  assert.match(assistant, /Need help\?/);
  assert.match(assistant, /launcherClosedLabel/);
  assert.match(assistant, /min-h-\[44px\]/);
  assert.match(assistant, /h-11/);
  assert.doesNotMatch(
    assistant,
    /Can I help \?\s*<\/span>\s*<span[^>]*>\s*Quotes · help · contact/,
  );
  console.log("OK  Need help? / Help pills · no old large card");
}

console.log("\n=== 2. Truly fixed to viewport (visible on load, survives scroll) ===");
{
  assert.match(assistant, /chooseHelpCorner/);
  assert.match(assistant, /HelpCorner/);
  assert.match(assistant, /bottom-right/);
  assert.match(assistant, /bottom-left/);
  assert.match(assistant, /top-right/);
  assert.match(assistant, /position:\s*"fixed"/);
  assert.match(assistant, /createPortal\([\s\S]*document\.body/);
  assert.match(assistant, /HELP_EDGE_PX/);
  assert.match(assistant, /safe-area-inset-bottom/);
  assert.match(assistant, /safe-area-inset-right/);
  // Must not dock into page flow (that hid the button until scroll).
  assert.doesNotMatch(assistant, /matni-help-dock/);
  assert.doesNotMatch(assistant, /helpPlacement === "dock"/);
  assert.doesNotMatch(hero, /matni-help-dock/);
  assert.doesNotMatch(locationQuote, /matni-help-dock/);
  assert.doesNotMatch(css, /matni-help-dock/);
  assert.doesNotMatch(css, /#quote #quote-step1-next/);
  console.log("OK  fixed body portal · corner fallbacks · no in-flow dock");
}

console.log("\n=== 3. Help behaviour + WhatsApp FAB + hero CTAs ===");
{
  assert.match(assistant, /toggleOpen/);
  assert.match(assistant, /respondToAssistantMessage/);
  assert.match(assistant, /shouldHidePublicSalesWidgets/);
  assert.match(layout, /QuoteAssistant/);
  assert.doesNotMatch(assistant, /if \(isMobile === true\) return null/);
  assert.match(wa, /return null/);
  assert.doesNotMatch(wa, /fixed bottom-/);
  assert.doesNotMatch(hero, /Get a Fixed Quote/);
  assert.doesNotMatch(hero, /Book Your Transfer/);
  console.log("OK  behaviour unchanged · WhatsApp FAB off · hero CTAs stay removed");
}

console.log("\nAll compact-help-button checks passed.");
