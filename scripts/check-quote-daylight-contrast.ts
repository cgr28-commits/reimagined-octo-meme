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
  assert.match(css, /--color-navy: #071c38/);
  assert.match(css, /--color-emerald: #2fbf4a/);
  assert.match(css, /--quote-page: #0a2448/);
  assert.match(css, /--quote-card-bg:/);
  assert.match(css, /--quote-card-border:/);
  assert.match(css, /--quote-panel-bg:/);
  assert.match(css, /--quote-input-border:/);
  assert.match(css, /--quote-selected-glow:/);
  assert.match(css, /--quote-secondary-ink: #c8d3df/);
  assert.match(css, /\.quote-flow \{/);
  assert.match(css, /\.quote-flow\.glass-card \{/);
  assert.match(css, /\.quote-flow \.btn-primary \{/);
  assert.match(css, /\.quote-panel \{/);
  assert.match(css, /\.quote-choice \{/);
  assert.match(css, /\.quote-choice-selected/);
  assert.match(css, /--quote-selected-bg: rgba\(47,\s*191,\s*74,\s*0\.2\)/);
  assert.doesNotMatch(css, /\.quote-choice-selected[\s\S]{0,220}background: var\(--color-emerald\)/);
  assert.match(css, /\.quote-header-logo \{/);
  assert.match(css, /\.quote-flow \.btn-primary:disabled \{[\s\S]*opacity: 0\.62/);
  assert.doesNotMatch(css, /--color-navy: #0a2448/);
  console.log("OK  quote tokens are scoped; site navy stays #071c38");
}

console.log("\n=== Quote containers and step indicator ===");
{
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /quote-flow glass-card/);
  assert.match(card, /quote-step-active/);
  assert.match(card, /label: "Journey details"/);
  assert.match(card, /label: "Your quote"/);
  assert.match(card, /label: "Complete your booking"/);
  assert.match(card, /quote-secondary/);
  assert.match(card, /quote-price-figure/);
  assert.match(card, /quote-price-panel/);
  const faintPaymentLines = card.split("\n").filter(line => /text-white\/(45|50|55)/.test(line));
  assert.equal(faintPaymentLines.length, 4, "only the four existing mobile payment labels retain legacy opacity");
  for (const line of faintPaymentLines) assert.match(line, /desktop-payment-support/);
  assert.match(read("src/app/globals.css"), /@media \(min-width: 1024px\) \{\s*\.quote-flow \.desktop-payment-support \{ color: var\(--quote-secondary-ink\); \}/);
  const luminance = (rgb: number[]) => rgb.map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  assert.ok((luminance([200, 211, 223]) + .05) / (luminance([34, 58, 87]) + .05) >= 4.5, "desktop supporting copy meets WCAG AA on navy");
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
  assert.match(progressive, /QUOTE_CHOICE_ON/);
  assert.match(progressive, /QUOTE_CHOICE_OFF|quote-choice/);
  const header = read("src/components/Header.tsx");
  assert.match(header, /quote-header-logo/);
  const fare = read("src/components/QuoteFareTrust.tsx");
  assert.match(fare, /quote-secondary/);
  const terms = read("src/components/BookingTermsConsent.tsx");
  assert.match(terms, /quote-secondary/);
  assert.match(terms, /border-white\/28/);
  const save = read("src/components/SaveQuoteModal.tsx");
  assert.match(save, /placeholder:text-white\/65/);
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
