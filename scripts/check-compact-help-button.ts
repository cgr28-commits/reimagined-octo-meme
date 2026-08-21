/**
 * Compact public Help launcher — must not compete with the quote booking flow.
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
const wa = read("src/components/WhatsAppButton.tsx");
const layout = read("src/app/layout.tsx");

console.log("=== 1. Compact Help pill (not large floating card) ===");
{
  assert.match(assistant, /data-matni-help-launcher/);
  assert.match(assistant, /matni-help-launcher/);
  assert.match(assistant, />Help</);
  assert.match(assistant, /rounded-full/);
  assert.match(assistant, /h-9/);
  // Closed launcher must not render the old large two-line card copy.
  assert.doesNotMatch(
    assistant,
    /Can I help \?\s*<\/span>\s*<span[^>]*>\s*Quotes · help · contact/,
  );
  assert.doesNotMatch(assistant, /sm:h-12 sm:w-12/);
  assert.doesNotMatch(assistant, /sm:h-16 sm:w-16/);
  assert.doesNotMatch(assistant, /max-w-\[9\.5rem\]/);
  console.log("OK  compact Help pill · no large Can I help card");
}

console.log("\n=== 2. Help / contact behaviour unchanged ===");
{
  assert.match(assistant, /toggleOpen/);
  assert.match(assistant, /respondToAssistantMessage/);
  assert.match(assistant, /submitAssistantBooking/);
  assert.match(assistant, /emailAssistantQuote/);
  assert.match(assistant, /shouldHidePublicSalesWidgets/);
  assert.match(layout, /QuoteAssistant/);
  console.log("OK  chat + booking helpers + portal gating intact");
}

console.log("\n=== 3. WhatsApp floating button stays retired ===");
{
  assert.match(wa, /return null/);
  assert.doesNotMatch(wa, /fixed bottom-/);
  assert.match(layout, /WhatsAppButton/);
  assert.doesNotMatch(assistant, /WhatsAppButton/);
  console.log("OK  no WhatsApp FAB restored");
}

console.log("\n=== 4. Responsive: desktop / tablet / mobile ===");
{
  // Mobile phones: launcher not mounted (quote form + Need help WhatsApp stay clear).
  assert.match(assistant, /if \(isMobile === true\) return null/);
  assert.match(assistant, /Phones use the on-page quote form/);

  // Shared safe-area corner positioning (tablet + desktop when mounted).
  assert.match(css, /\.matni-help-launcher/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /safe-area-inset-right/);
  assert.match(css, /bottom:\s*max\(0\.75rem,\s*env\(safe-area-inset-bottom/);
  assert.match(css, /right:\s*max\(0\.75rem,\s*env\(safe-area-inset-right/);

  // Tablet: quote CTA gutter so Book/Continue are not under the pill.
  assert.match(css, /min-width:\s*768px\) and \(max-width:\s*1279px\)/);
  assert.match(css, /#quote #quote-step1-next/);
  assert.match(css, /#quote #quoteResult/);
  assert.match(css, /padding-right:\s*4\.25rem/);

  // Desktop wide: tuck into page gutter outside max-w-7xl.
  assert.match(css, /min-width:\s*1280px/);
  assert.match(css, /100vw - 80rem/);
  assert.match(css, /\.matni-help-panel/);

  console.log("OK  mobile hide · tablet CTA clearance · desktop gutter · safe-area");
}

console.log("\nAll compact-help-button checks passed.");
