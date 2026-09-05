/**
 * Mobile site menu: scrollable overlay so final contact actions stay reachable.
 * Run: npx tsx scripts/check-mobile-menu-scroll.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const header = readFileSync(join(root, "src/components/Header.tsx"), "utf8");

console.log("=== Mobile menu scroll + safe-area reachability ===");

// Overlay is fixed to the dynamic viewport (not content-height only).
assert.match(header, /fixed inset-0 z-\[80\][\s\S]*h-\[100dvh\][\s\S]*max-h-\[100dvh\]/);
assert.doesNotMatch(
  header,
  /absolute inset-x-0 top-0 flex max-h-\[100dvh\] flex-col overflow-y-auto/,
);
console.log("OK  overlay uses fixed 100dvh shell (not top-anchored max-h panel alone)");

// Header/Close stays outside the scrolling region (shrink-0 sibling).
assert.match(
  header,
  /flex shrink-0 items-center justify-between[\s\S]*aria-label="Close menu"/,
);
assert.match(header, /pt-\[env\(safe-area-inset-top\)\]/);
console.log("OK  Close/header is shrink-0 above the scroll region (safe-area top)");

// Menu content scrolls independently with safe-area bottom padding.
assert.match(
  header,
  /className="min-h-0 flex-1 overflow-y-auto overscroll-contain[\s\S]*?aria-label="Mobile navigation"/,
);
assert.match(
  header,
  /pb-\[calc\(1\.5rem\+env\(safe-area-inset-bottom\)\)\]/,
);
console.log("OK  nav is independently scrollable with safe-area bottom padding");

// Body scroll lock while open (overflow + iOS position:fixed).
assert.match(header, /body\.style\.overflow = "hidden"/);
assert.match(header, /body\.style\.position = "fixed"/);
assert.match(header, /window\.scrollTo\(0, scrollY\)/);
console.log("OK  page behind menu is locked while open");

// Contact action ordering preserved; final Contact remains last and reachable.
const navStart = header.indexOf('aria-label="Mobile navigation"');
assert.ok(navStart > 0);
const navEnd = header.indexOf("</nav>", navStart);
assert.ok(navEnd > navStart);
const navBlock = header.slice(navStart, navEnd);
const order = [
  "Manage Your Booking",
  "Get a Quote",
  "WhatsApp @{SITE.whatsappUsername}",
  'href="/contact/"',
];
let cursor = -1;
for (const label of order) {
  const at = navBlock.indexOf(label);
  assert.ok(at > cursor, `expected ${label} after previous contact actions`);
  cursor = at;
}
assert.match(navBlock, /href="\/contact\/"[\s\S]*?\n\s*Contact\n/);
assert.ok(
  navBlock.lastIndexOf('href="/contact/"') > navBlock.lastIndexOf("WhatsApp"),
  "final contact action (Contact) must remain last so scroll reaches it",
);
console.log("OK  contact action order preserved; Contact remains the final reachable action");

// Destinations / WhatsApp + email contact unchanged.
assert.match(header, /href="\/manage-booking\/"/);
assert.doesNotMatch(header, /tel:|landlineDisplay|Call \{SITE/);
assert.match(header, /whatsAppChatUrl\(\)/);
console.log("OK  navigation destinations and contact details unchanged");

console.log("\nAll mobile menu scroll checks passed.");
