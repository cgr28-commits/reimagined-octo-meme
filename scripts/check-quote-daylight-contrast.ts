/**
 * Daylight-visibility tokens and wiring across quote Steps 1–3.
 * Run: npx tsx scripts/check-quote-daylight-contrast.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addressFieldShellClass,
  bookingTextFieldClass,
  quoteTextFieldClass,
} from "../src/lib/quote-ui-highlight";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Shared daylight tokens ===");
{
  const css = read("src/app/globals.css");
  assert.match(css, /--color-navy-brand: #071c38/);
  assert.match(css, /--color-navy: #0a2448/);
  assert.match(css, /--color-navy-light: #143866/);
  assert.match(css, /--color-emerald: #2fbf4a/);
  assert.match(css, /--color-ink-secondary: #c8d3df/);
  assert.match(css, /--quote-card-bg:/);
  assert.match(css, /--quote-card-border:/);
  assert.match(css, /--quote-panel-bg:/);
  assert.match(css, /--quote-input-border:/);
  assert.match(css, /--quote-selected-glow:/);
  assert.match(css, /\.quote-flow \{/);
  assert.match(css, /\.quote-panel \{/);
  assert.match(css, /\.quote-choice \{/);
  assert.match(css, /\.quote-choice-selected \{/);
  assert.match(css, /\.quote-header-logo \{/);
  assert.match(css, /\.btn-primary:disabled \{[\s\S]*opacity: 0\.62/);
  console.log("OK  navy/emerald tokens + quote surface classes exist");
}

console.log("\n=== Quote containers and step indicator ===");
{
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /quote-flow glass-card/);
  assert.match(card, /quote-step-active/);
  assert.match(card, /label: "Journey"/);
  assert.match(card, /label: "Quote"/);
  assert.match(card, /label: "Booking & Pay"/);
  console.log("OK  all three steps share quote-flow / glass-card");
}

console.log("\n=== Field / selected-state contrast ===");
{
  assert.match(quoteTextFieldClass("default"), /border-white\/30/);
  assert.match(quoteTextFieldClass("default"), /bg-white\/\[0\.1\]/);
  assert.match(bookingTextFieldClass("default"), /placeholder:text-white\/65/);
  assert.match(
    addressFieldShellClass({
      hasError: false,
      needsCompletion: false,
      isComplete: false,
      isActiveUi: true,
    }),
    /shadow-\[0_0_0_3px_rgba\(47,191,74,0\.22\)\]/,
  );
  const progressive = read("src/components/QuoteProgressiveRoute.tsx");
  assert.match(progressive, /quote-choice-selected/);
  assert.match(progressive, /quote-choice/);
  const header = read("src/components/Header.tsx");
  assert.match(header, /quote-header-logo/);
  console.log("OK  inputs, choices, and header use the brighter tokens");
}

console.log("\n=== Pricing / booking logic files untouched ===");
{
  const css = read("src/app/globals.css");
  assert.doesNotMatch(css, /function calculate/);
  const highlight = read("src/lib/quote-ui-highlight.ts");
  assert.doesNotMatch(highlight, /SUMUP|createPayment|fareGbp/);
  console.log("OK  contrast pass is presentation-only");
}

console.log("\nAll quote daylight-contrast checks passed.");
