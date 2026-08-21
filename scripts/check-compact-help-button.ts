/**
 * Public Help launcher — visible, never over the Live Quote card.
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

console.log("=== 1. Desktop / mobile Help labels (not tiny, not large card) ===");
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
  assert.doesNotMatch(assistant, /sm:h-16 sm:w-16/);
  assert.doesNotMatch(assistant, /max-w-\[9\.5rem\]/);
  console.log("OK  Need help? / Help pills · no old large card");
}

console.log("\n=== 2. Never float over the Live Quote card ===");
{
  assert.match(assistant, /HelpPlacement/);
  assert.match(assistant, /rectsOverlap/);
  assert.match(assistant, /helpPlacement === "dock"/);
  assert.match(assistant, /matni-help-dock/);
  assert.match(assistant, /HELP_EDGE_PX/);
  assert.match(assistant, /HELP_QUOTE_PAD_PX/);
  assert.match(hero, /id="matni-help-dock"/);
  assert.match(locationQuote, /id="matni-help-dock"/);
  assert.match(css, /\.matni-help-launcher--float/);
  assert.match(css, /bottom:\s*max\(22px,\s*env\(safe-area-inset-bottom/);
  assert.match(css, /right:\s*max\(22px,\s*env\(safe-area-inset-right/);
  // Old “pad the CTAs under a covering float” approach must stay gone.
  assert.doesNotMatch(css, /#quote #quote-step1-next/);
  assert.doesNotMatch(css, /padding-right:\s*4\.25rem/);
  console.log("OK  collision → dock below quote · float only in free corner");
}

console.log("\n=== 3. Help / contact behaviour unchanged ===");
{
  assert.match(assistant, /toggleOpen/);
  assert.match(assistant, /respondToAssistantMessage/);
  assert.match(assistant, /submitAssistantBooking/);
  assert.match(assistant, /emailAssistantQuote/);
  assert.match(assistant, /shouldHidePublicSalesWidgets/);
  assert.match(layout, /QuoteAssistant/);
  // Mobile mounts the launcher (docked under quote when needed).
  assert.doesNotMatch(assistant, /if \(isMobile === true\) return null/);
  console.log("OK  chat helpers + portal gating · mobile Help enabled via dock");
}

console.log("\n=== 4. WhatsApp FAB stays retired · hero CTAs stay removed ===");
{
  assert.match(wa, /return null/);
  assert.doesNotMatch(wa, /fixed bottom-/);
  assert.match(layout, /WhatsAppButton/);
  assert.doesNotMatch(hero, /Get a Fixed Quote/);
  assert.doesNotMatch(hero, /Book Your Transfer/);
  console.log("OK  no WhatsApp FAB · hero Fixed Quote / Book Transfer still gone");
}

console.log("\nAll compact-help-button checks passed.");
