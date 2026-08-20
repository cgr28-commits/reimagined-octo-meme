/**
 * Customer /book-quote/ mobile overflow guards — offline checks.
 * Run: npx tsx scripts/check-book-quote-mobile.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== book-quote page shell ===");
{
  const page = read("src/app/book-quote/page.tsx");
  assert.match(page, /min-w-0/);
  assert.match(page, /max-w-\[100%\]|max-w-full/);
  assert.match(page, /overflow-x-clip/);
  assert.match(page, /max-w-lg/);
  assert.doesNotMatch(page, /w-screen/);
  console.log("OK  page shell constrains width");
}

console.log("\n=== Confirm your details inputs (no iOS zoom) ===");
{
  const client = read("src/app/book-quote/BookQuoteCustomerClient.tsx");
  assert.match(client, /Confirm your details/);
  assert.match(client, /quote-text-input/);
  assert.match(client, /text-base/);
  // text-sm on inputs causes Safari focus zoom → sideways pan with keyboard
  assert.doesNotMatch(
    client,
    /placeholder="Full name"[\s\S]{0,120}text-sm/,
  );
  assert.match(client, /w-full min-w-0 max-w-lg/);
  assert.match(client, /break-words/);
  assert.match(client, /min-w-0/);
  for (const width of [375, 390, 430]) {
    assert.ok(width <= 430);
    assert.match(client, /max-w-lg/);
    assert.match(client, /min-w-0/);
  }
  console.log("OK  16px inputs + min-w-0 for 375/390/430");
}

console.log("\n=== WhatsApp FAB hidden on checkout ===");
{
  const portal = read("src/lib/owner-portal.ts");
  assert.match(portal, /book-quote/);
  assert.match(portal, /shouldHidePublicSalesWidgets/);
  const wa = read("src/components/WhatsAppButton.tsx");
  // Floating FAB removed site-wide from the quote funnel; component is a no-op.
  assert.match(wa, /return null/);
  assert.doesNotMatch(wa, /fixed bottom-/);
  console.log("OK  floating WhatsApp not rendered (including /book-quote)");
}

console.log("\n=== Payment / booking logic preserved ===");
{
  const client = read("src/app/book-quote/BookQuoteCustomerClient.tsx");
  assert.match(client, /createPaymentCheckout/);
  assert.match(client, /quickQuoteId/);
  assert.match(client, /Confirm Booking & Pay/);
  assert.match(client, /SumUp/);
  console.log("OK  SumUp booking flow untouched");
}

console.log("\nAll book-quote mobile checks passed.");
