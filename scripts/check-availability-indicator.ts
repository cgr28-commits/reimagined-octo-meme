/**
 * Checks for the quote-results availability indicator view rules (src/lib/availability-indicator-view.ts).
 * Run: npx tsx scripts/check-availability-indicator.ts
 */
import assert from "node:assert/strict";
import { demandIndicatorFor } from "../shared/demand-indicator";
import {
  AVAILABILITY_SEGMENTS,
  availabilityBandFor,
  availabilitySegmentsFor,
  availabilityViewFor,
} from "../src/lib/availability-indicator-view";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check("ten segments", () => assert.equal(AVAILABILITY_SEGMENTS, 10));

check("colour bands: 0–39 green, 40–59 yellow, 60–79 amber, 80–100 red", () => {
  const tone = (p: number) => availabilityBandFor(p).tone;
  for (const [p, t] of [[0, "green"], [39, "green"], [40, "yellow"], [59, "yellow"], [60, "amber"], [79, "amber"], [80, "red"], [100, "red"]] as const) {
    assert.equal(tone(p), t, `${p}%`);
  }
  assert.equal(availabilityBandFor(20).status, "Good availability");
  assert.equal(availabilityBandFor(50).status, "Bookings filling up");
  assert.equal(availabilityBandFor(70).status, "Limited availability");
  assert.equal(availabilityBandFor(90).status, "Very limited availability");
});

check("segments are 10ths of the figure", () => {
  assert.equal(availabilitySegmentsFor(0), 0);
  assert.equal(availabilitySegmentsFor(3), 1);
  assert.equal(availabilitySegmentsFor(60), 6);
  assert.equal(availabilitySegmentsFor(70), 7);
  assert.equal(availabilitySegmentsFor(80), 8);
  assert.equal(availabilitySegmentsFor(90), 9);
  assert.equal(availabilitySegmentsFor(100), 10);
});

const now = new Date("2026-11-27T12:00:00Z");
const view = (tripDate: string, extra: Record<string, string> = {}) => availabilityViewFor(demandIndicatorFor({ tripDate, ...extra }, now)!);

check("owner diary figures read 'booked' (Fri 4 Dec is estimated; Sat 28 Nov is diary)", () => {
  const v = view("2026-11-28"); // Saturday in November → owner-set 70%
  assert.equal(v.kind, "figure");
  assert.equal(v.estimated, false);
  assert.equal(v.percentLabel, "70% booked");
  assert.equal(v.status, "Limited availability");
  assert.equal(v.heading, "Availability is filling up");
  assert.equal(v.showTrendIcon, true);
  assert.equal(v.filledSegments, 7);
  assert.equal(v.bookEarly, true);
});

check("December estimates never say 'booked' and are worded as expectations", () => {
  for (let day = 1; day <= 31; day++) {
    const iso = `2026-12-${String(day).padStart(2, "0")}`;
    const v = view(iso);
    assert.equal(v.kind, "figure", iso);
    assert.equal(v.estimated, true, iso);
    assert.match(v.percentLabel ?? "", /% expected demand$/, iso);
    assert.doesNotMatch(`${v.percentLabel} ${v.status} ${v.heading}`, /booked/i, iso);
    assert.match(v.status ?? "", /expected/i, iso);
  }
  assert.equal(view("2026-12-26").percent, 90); // Saturday
  assert.equal(view("2026-12-26").tone, "red");
  assert.equal(view("2026-12-01").tone, "amber"); // Monday 60
});

check("'fully booked' wording is never produced, even at 100%", () => {
  const banned = /(fully|sold out|no availability|last (few|seats|cars)|only \d)/i;
  for (const p of [0, 39, 40, 59, 60, 79, 80, 99, 100]) {
    const band = availabilityBandFor(p);
    assert.doesNotMatch(`${band.status} ${band.estimatedStatus}`, banned, `${p}%`);
  }
});

check("dates with no figure get no bar and no invented percentage", () => {
  const ordinary = view("2027-02-10");
  assert.equal(ordinary.kind, "none");
  assert.equal(ordinary.percent, null);
  assert.equal(ordinary.filledSegments, 0);
  assert.equal(ordinary.bookEarly, false);
  const easter = view("2027-03-26"); // busy season, no figure
  assert.equal(easter.kind, "level");
  assert.equal(easter.percent, null);
  assert.equal(easter.percentLabel, null);
  assert.equal(easter.filledSegments, 0);
  assert.equal(easter.bookEarly, true);
  const soon = view("2026-11-29"); // Sunday, but Nov Fri–Sun is diary 70 → figure
  assert.equal(soon.kind, "figure");
  const soonWeekday = view("2026-11-30"); // Monday, 3 days away
  assert.equal(soonWeekday.kind, "none");
  assert.match(soonWeekday.note ?? "", /Travelling soon/);
});

console.log(`\n${passed} checks passed`);
