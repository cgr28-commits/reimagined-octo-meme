/**
 * Address input must keep spaces after house numbers while typing.
 * Run: npx tsx scripts/check-address-space-typing.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const addressInput = readFileSync(join("src/components/AddressInput.tsx"), "utf8");
const quoteCard = readFileSync(join("src/components/QuoteCard.tsx"), "utf8");

assert.match(
  addressInput,
  /formattedAddress:\s*next/,
  "AddressInput refine path must keep exact typed text (not next.trim())",
);
assert.match(
  addressInput,
  /displayAddress:\s*next/,
  "AddressInput refine path must set displayAddress to exact typed text",
);
assert.doesNotMatch(
  addressInput,
  /formattedAddress:\s*next\.trim\(\)/,
  "AddressInput must not trim formattedAddress on each refine keystroke",
);

assert.match(
  quoteCard,
  /if\s*\(\s*!place\.placeId\?\.trim\(\)\s*\)/,
  "QuoteCard must skip address rewrite when placeId is cleared by typing",
);
assert.match(
  quoteCard,
  /place\.displayAddress\s*\|\|\s*place\.formattedAddress/,
  "QuoteCard must sync from untrimmed display/formatted text",
);

// Simulate the collapse bug we fixed: trimming "24 " must not be applied to the controlled value path.
function preserveTypedAddress(onChangeValue: string, placeId: string, displayAddress: string) {
  if (!placeId.trim()) {
    return onChangeValue;
  }
  return displayAddress || onChangeValue;
}

assert.equal(preserveTypedAddress("24 ", "", "Colinward Street"), "24 ");
assert.equal(preserveTypedAddress("24 Colinward Street", "", ""), "24 Colinward Street");
assert.equal(
  preserveTypedAddress("24 Colinward Street", "ChIJ", "24 Colinward Street"),
  "24 Colinward Street",
);

console.log("OK  Address space-typing guards in place (pickup/drop-off share AddressInput + QuoteCard handlers)");
console.log("All address-space typing checks passed.");
