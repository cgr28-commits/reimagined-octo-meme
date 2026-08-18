/**
 * Owner Dashboard — Booking Availability mobile overflow guards (layout only).
 * Asserts date/time inputs and cards can shrink inside the viewport on iPhone widths.
 * Run: npx tsx scripts/check-owner-availability-overflow.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Availability date/time inputs shrink on iOS ===");
{
  const panel = read("src/components/OwnerShortNoticePanel.tsx");
  assert.match(panel, /fieldClass\s*=/);
  assert.match(panel, /box-border/);
  assert.match(panel, /min-w-0/);
  assert.match(panel, /max-w-full/);
  assert.match(panel, /\[color-scheme:dark\]/);
  assert.match(panel, /type="date"/);
  assert.match(panel, /type="time"/);
  assert.match(panel, /className=\{fieldClass\}/);
  // Must not rely solely on hiding overflow globally for this form.
  assert.doesNotMatch(panel, /overflow-x:\s*hidden|overflow-x-hidden/);
  console.log("OK  date/time fieldClass uses box-border + min-w-0 + max-w-full");
}

console.log("\n=== 2. Availability cards / period rows wrap on narrow screens ===");
{
  const panel = read("src/components/OwnerShortNoticePanel.tsx");
  assert.match(panel, /mb-8 w-full min-w-0 max-w-full rounded-2xl/);
  assert.match(panel, /grid grid-cols-1 gap-3 sm:grid-cols-2/);
  assert.match(panel, /break-words text-sm font-bold text-white/);
  assert.match(
    panel,
    /flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between/,
  );
  assert.match(panel, /formatUnavailablePeriodRangeLabel/);
  console.log("OK  section/cards min-w-0; period rows stack; long ranges break-words");
}

console.log("\n=== 3. Owner shell + calendar stay viewport-aligned ===");
{
  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /mx-auto w-full min-w-0 px-4/);

  const calendar = read("src/components/OwnerBookingCalendar.tsx");
  assert.match(calendar, /mb-10 w-full min-w-0 max-w-full rounded-2xl/);
  assert.match(calendar, /type="date"/);
  assert.match(calendar, /box-border min-h-9 w-full min-w-0 max-w-full/);
  console.log("OK  Owner content wrapper + calendar date picker can shrink");
}

console.log("\n=== 4. Personal quotes panel uses same overflow guards ===");
{
  const panel = read("src/components/OwnerPersonalQuotesPanel.tsx");
  assert.match(panel, /mb-8 w-full min-w-0 max-w-full rounded-2xl/);
  assert.match(panel, /fieldClass\s*=/);
  assert.match(panel, /box-border/);
  assert.match(panel, /min-w-0/);
  assert.match(panel, /max-w-full/);
  assert.match(panel, /text-base/);
  assert.match(panel, /\[color-scheme:dark\]/);
  assert.match(panel, /type="date"/);
  assert.match(panel, /className=\{fieldClass\}/);
  assert.match(panel, /grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2/);
  assert.doesNotMatch(panel, /overflow-x:\s*hidden|overflow-x-hidden/);
  const css = read("src/app/globals.css");
  assert.match(css, /scrollbar-gutter:\s*stable/);
  console.log("OK  Personal quotes min-w-0 + date field shrink; scrollbar-gutter stable");
}

console.log("\nAll owner availability overflow checks passed.");
