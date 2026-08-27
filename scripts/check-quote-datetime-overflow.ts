/**
 * Quote Step 2 date/time fields must shrink inside the card on iPhone widths.
 * Root cause previously: grid min-width:auto + native date/time intrinsic size,
 * clipped by form overflow-x-clip (right border/radius disappeared).
 * Run: npx tsx scripts/check-quote-datetime-overflow.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { quoteTextFieldClass } from "../src/lib/quote-ui-highlight";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== quoteTextFieldClass shrink guards ===");
{
  const cls = quoteTextFieldClass("needs");
  assert.match(cls, /box-border/);
  assert.match(cls, /\bw-full\b/);
  assert.match(cls, /min-w-0/);
  assert.match(cls, /max-w-full/);
  assert.match(cls, /ring-inset/);
  assert.match(cls, /quote-text-input/);
  console.log("OK  shared field class has box-border + min-w-0 + max-w-full + ring-inset");
}

console.log("\n=== QuoteCard date/time grid cells ===");
{
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /type="date"/);
  assert.match(card, /type="time"/);
  assert.match(
    card,
    /grid w-full min-w-0 max-w-full gap-4 sm:grid-cols-2[\s\S]*htmlFor="date"/,
  );
  assert.match(card, /htmlFor="date"[\s\S]*?<div className="min-w-0 max-w-full">[\s\S]*?htmlFor="time"/);
  assert.match(
    card,
    /grid w-full min-w-0 max-w-full gap-4 sm:grid-cols-2[\s\S]*htmlFor="returnDate"/,
  );
  assert.match(card, /quoteTextFieldClass/);
  assert.match(card, /overflow-x-clip/);
  console.log("OK  date/time wrappers use min-w-0 max-w-full inside shrinkable grids");
}

console.log("\n=== globals date/time containment ===");
{
  const css = read("src/app/globals.css");
  assert.match(css, /#quoteForm input\[type="date"\]/);
  assert.match(css, /#quoteForm input\[type="time"\]/);
  assert.match(
    css,
    /#quoteForm input\[type="date"\][\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%|#quoteForm input\[type="date"\],\s*\n#quoteForm input\[type="time"\][\s\S]*min-width:\s*0/,
  );
  console.log("OK  #quoteForm date/time forced to box-border width 100% / min-width 0");
}

console.log("\nAll quote datetime overflow checks passed.");
