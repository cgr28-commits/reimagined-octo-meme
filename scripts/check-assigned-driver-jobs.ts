/**
 * Assigned (non-owner) drivers:
 * - customer is emailed first name, mobile and partial reg once, on accept; never for the owner
 * - no WhatsApp message, auto-open or WhatsApp button; no live location sharing
 * - three steps: On the way → Arrived → Complete job
 * - Past jobs tab (own jobs, last 120 days)
 *
 * Run: tsx scripts/check-assigned-driver-jobs.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sequentialDriverJourneyActions } from "../shared/driver-portal-access";
import { allowedJourneyActions } from "../shared/tracking";
import { formatPartialRegistration } from "../shared/partial-registration";
import {
  assignedDriverIsOwner,
  customerDriverDetailsMarkerKey,
} from "../workers/addresses/src/customer-driver-details";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let checks = 0;
const check = (name: string, fn: () => void) => {
  fn();
  checks++;
  console.log(`OK  ${name}`);
};

check("Partial registration format", () => {
  assert.equal(formatPartialRegistration("CR66 ARA"), "CR66 ***");
  assert.equal(formatPartialRegistration("CR66ARA"), "CR66 ***");
  assert.equal(formatPartialRegistration(""), "");
});

check("Owner is recognised by email or mobile; other drivers are not", () => {
  const owner = { email: "Colin@Example.com", mobile: "07700 900111" };
  assert.equal(assignedDriverIsOwner({ email: "colin@example.com" }, owner), true);
  assert.equal(assignedDriverIsOwner({ mobile: "+44 7700 900111" }, owner), true);
  assert.equal(assignedDriverIsOwner({ email: "gary@example.com", mobile: "07700 900222" }, owner), false);
  assert.equal(assignedDriverIsOwner({ email: "gary@example.com" }, null), false);
  assert.equal(assignedDriverIsOwner({}, owner), false);
});

check("One email per job and driver (both accept paths share the marker)", () => {
  const a = customerDriverDetailsMarkerKey("SUMUP-1", { email: "Gary@Example.com" });
  const b = customerDriverDetailsMarkerKey("SUMUP-1", { email: "gary@example.com", mobile: "07700900222" });
  const c = customerDriverDetailsMarkerKey("SUMUP-1", { email: "john@example.com" });
  assert.equal(a, b, "same job + driver → same marker");
  assert.notEqual(a, c, "reassigned driver → new email");
});

check("Three driver steps: On the way → Arrived → Complete job", () => {
  assert.deepEqual(sequentialDriverJourneyActions("idle"), ["start_tracking", "arrived_pickup"]);
  assert.deepEqual(sequentialDriverJourneyActions("tracking"), ["arrived_pickup"]);
  assert.deepEqual(sequentialDriverJourneyActions("arrived_pickup"), ["complete_journey"]);
  assert.deepEqual(sequentialDriverJourneyActions("completed"), []);
  // The journey state machine accepts Complete straight after Arrived.
  assert.ok(allowedJourneyActions("arrived_pickup").includes("complete_journey"));
});

check("Worker: no WhatsApp text and no live sharing for driver sessions", () => {
  const journey = read("workers/addresses/src/journey-handlers.ts");
  assert.match(journey, /if \(session\.role !== "owner"\) return undefined;/);
  assert.match(journey, /session\.role === "driver"\) \{\s*\/\/ No live location tracking[^\n]*\n\s*next\.sharingActive = false;/);
});

check("Worker: both accept paths email the customer", () => {
  assert.match(read("workers/addresses/src/booking-job-handlers.ts"), /sendCustomerDriverDetailsOnAccept\(env, \{/);
  assert.match(read("workers/addresses/src/driver-assignment-handlers.ts"), /if \(action === "accept"\) \{[\s\S]*?sendCustomerDriverDetailsOnAccept\(env, \{/);
});

check("Driver page: WhatsApp only for the owner; Complete job label; Past jobs tab", () => {
  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /isOwner && action === "arrived_pickup" && !SERVICE_FLAGS\.liveDriverTracking/);
  assert.match(page, /isOwner && action === "start_tracking" && !SERVICE_FLAGS\.liveDriverTracking/);
  assert.doesNotMatch(page, /WhatsApp customer/);
  assert.doesNotMatch(page, /customerWhatsAppHref/);
  assert.match(page, /!isOwner && action === "complete_journey" \? "Complete job"/);
  assert.match(page, /viewRole === "driver" \? \(\[\["past", "Past jobs"\]\] as const\)/);
  assert.match(page, /scope: "range",\s*from: shiftLondonDate\(today, -120\),\s*to: shiftLondonDate\(today, -1\)/);
});

console.log(`\nAll ${checks} assigned-driver checks passed.`);
