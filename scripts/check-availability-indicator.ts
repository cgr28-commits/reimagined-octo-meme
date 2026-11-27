/**
 * Checks for the quote-results demand indicator (src/lib/availability-indicator-view.ts + component).
 * Run: npx tsx scripts/check-availability-indicator.ts
 */
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demandIndicatorFor } from "../shared/demand-indicator";
import SeasonalBookingMessage from "../src/components/SeasonalBookingMessage";
import {
  AVAILABILITY_SEGMENTS,
  availabilityBandFor,
  availabilitySegmentsFor,
  availabilityViewFor,
} from "../src/lib/availability-indicator-view";

// tsx compiles the component with the classic JSX runtime (tsconfig is jsx: preserve for Next).
(globalThis as unknown as { React: typeof React }).React = React;

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const now = new Date("2026-11-27T12:00:00Z");
const view = (tripDate: string) => availabilityViewFor(demandIndicatorFor({ tripDate }, now)!);

check("ten segments", () => assert.equal(AVAILABILITY_SEGMENTS, 10));

check("levels: 0–39 low/green, 40–59 moderate/yellow, 60–79 high/amber, 80–100 very high/red", () => {
  for (const [p, tone, status] of [
    [0, "green", "Low expected demand"], [39, "green", "Low expected demand"],
    [40, "yellow", "Moderate expected demand"], [59, "yellow", "Moderate expected demand"],
    [60, "amber", "High expected demand"], [79, "amber", "High expected demand"],
    [80, "red", "Very high expected demand"], [100, "red", "Very high expected demand"],
  ] as const) {
    const b = availabilityBandFor(p);
    assert.equal(b.tone, tone, `${p}`);
    assert.equal(b.status, status, `${p}`);
  }
});

check("internal segments follow the internal figure", () => {
  assert.equal(availabilitySegmentsFor(0), 0);
  assert.equal(availabilitySegmentsFor(3), 1);
  assert.equal(availabilitySegmentsFor(60), 6);
  assert.equal(availabilitySegmentsFor(70), 7);
  assert.equal(availabilitySegmentsFor(90), 9);
  assert.equal(availabilitySegmentsFor(100), 10);
});

check("existing figures still decide the level (Sat 28 Nov 70 → high; Mon 1 Dec 60 → high; Sat 26 Dec 90 → very high)", () => {
  assert.equal(view("2026-11-28").status, "High expected demand");
  assert.equal(view("2026-12-01").status, "High expected demand");
  assert.equal(view("2026-12-26").status, "Very high expected demand");
  assert.equal(view("2026-12-26").tone, "red");
  assert.equal(view("2026-12-26").filledSegments, 9);
});

check("book-early line only for high / very high", () => {
  assert.equal(availabilityViewFor({ ...demandIndicatorFor({ tripDate: "2026-12-26" }, now)!, bookedPercent: 50 }).bookEarly, false);
  assert.equal(availabilityViewFor({ ...demandIndicatorFor({ tripDate: "2026-12-26" }, now)!, bookedPercent: 20 }).bookEarly, false);
  assert.equal(view("2026-12-01").bookEarly, true);
  assert.equal(view("2026-12-26").bookEarly, true);
});

check("no customer-facing number or booking wording anywhere in the rendered card", () => {
  const dates = ["2026-11-28", "2026-11-30", ...Array.from({ length: 31 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`), "2027-01-01", "2027-02-10", "2027-03-26", "2027-12-24"];
  const banned = /(\d+\s*%|percent|booked|fully|sold out|no availability|last (few|seats|cars)|only \d|\bleft\b|hurry|selling fast)/i;
  for (const d of dates) {
    const html = renderToStaticMarkup(createElement(SeasonalBookingMessage, { tripDate: d }));
    const text = html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&");
    assert.doesNotMatch(text, banned, `${d}: ${text}`);
    assert.doesNotMatch(html, /data-demand-percent|aria-label="[^"]*\d+%/, d);
  }
});

check("rendered card keeps the date, 10 segments, cancellation line and level wording", () => {
  const html = renderToStaticMarkup(createElement(SeasonalBookingMessage, { tripDate: "2026-12-26" }));
  assert.match(html, /Saturday 26 December 2026/);
  assert.equal((html.match(/rounded-full/g) ?? []).length, 10);
  assert.match(html, /Very high expected demand/);
  assert.match(html, /Book early to secure your preferred pickup time/);
  assert.match(html, /Free cancellation 24\+ hours before pickup/);
});

check("dates with no figure or flag get no bar and no demand claim", () => {
  const ordinary = view("2027-02-10");
  assert.equal(ordinary.kind, "none");
  assert.equal(ordinary.status, null);
  assert.equal(ordinary.bookEarly, false);
  const html = renderToStaticMarkup(createElement(SeasonalBookingMessage, { tripDate: "2027-02-10" }));
  assert.doesNotMatch(html, /data-demand-bar/);
  assert.match(html, /Free cancellation 24\+ hours before pickup/);
  assert.match(view("2026-11-30").note ?? "", /Travelling soon/);
});

check("busy seasons / events without a figure still show a high or very high level", () => {
  const easter = view("2027-03-26");
  assert.equal(easter.kind, "bar");
  assert.match(easter.status ?? "", /^(High|Very high) expected demand$/);
  assert.equal(easter.bookEarly, true);
});

console.log(`\n${passed} checks passed`);
