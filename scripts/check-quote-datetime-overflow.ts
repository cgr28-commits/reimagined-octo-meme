/**
 * Quote Step 2 date/time fields must keep a full visible border on iPhone.
 *
 * Root cause: WebKit/iOS native date|time controls ignore min-width and keep a
 * large intrinsic size. Borders painted on the <input> overflow and get clipped
 * by #quoteForm { overflow-x: clip }. Fix: visible chrome on a wrapping shell
 * (overflow:hidden); input is borderless inside — same pattern as AddressInput.
 *
 * Run: npx tsx scripts/check-quote-datetime-overflow.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  quoteDateTimeFieldShellClass,
  quoteDateTimeInputClass,
  quoteTextFieldClass,
} from "../src/lib/quote-ui-highlight";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Shell owns the visible border ===");
{
  const shell = quoteDateTimeFieldShellClass("needs");
  assert.match(shell, /quote-datetime-shell/);
  assert.match(shell, /overflow-hidden|overflow-hidden/);
  assert.match(shell, /min-w-0/);
  assert.match(shell, /max-w-full/);
  assert.match(shell, /border-emerald\/50/);
  assert.match(shell, /ring-inset/);

  const inner = quoteDateTimeInputClass();
  assert.match(inner, /quote-datetime-input/);
  assert.match(inner, /border-0/);
  assert.match(inner, /min-w-0/);
  assert.match(inner, /max-w-full/);
  assert.match(inner, /text-\[1\.125rem\]|text-lg|1\.125rem/);
  assert.match(inner, /\[color-scheme:dark\]/);
  assert.doesNotMatch(inner, /\bborder border-/);

  // Text fields still use the bordered class helper.
  assert.match(quoteTextFieldClass("needs"), /border-emerald\/50/);
  console.log("OK  date/time shell has border; inner input is borderless");
}

console.log("\n=== QuoteCard wires shell around all date/time inputs ===");
{
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /quoteDateTimeFieldShellClass/);
  assert.match(card, /quoteDateTimeInputClass/);
  const dateCount = (card.match(/type="date"/g) || []).length;
  const timeCount = (card.match(/type="time"/g) || []).length;
  assert.equal(dateCount, 2);
  assert.equal(timeCount, 2);
  assert.equal((card.match(/quoteDateTimeFieldShellClass\(/g) || []).length, 4);
  assert.equal((card.match(/quoteDateTimeInputClass\(\)/g) || []).length, 4);
  // No date/time input should still paint its own border via quoteTextFieldClass.
  assert.doesNotMatch(
    card,
    /type="date"[\s\S]{0,500}?quoteTextFieldClass\(/,
  );
  assert.doesNotMatch(
    card,
    /type="time"[\s\S]{0,500}?quoteTextFieldClass\(/,
  );
  console.log("OK  all four date/time inputs use the shell pattern");
}

console.log("\n=== globals containment ===");
{
  const css = read("src/app/globals.css");
  assert.match(css, /\.quote-datetime-shell/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(css, /quote-datetime-input/);
  assert.match(css, /-webkit-appearance:\s*none/);
  assert.match(css, /::-webkit-date-and-time-value/);
  assert.match(css, /::-webkit-datetime-edit/);
  assert.match(css, /font-size:\s*1\.125rem/);
  console.log("OK  shell + appearance reset + larger centred value text");
}

console.log("\nAll quote datetime overflow checks passed.");
