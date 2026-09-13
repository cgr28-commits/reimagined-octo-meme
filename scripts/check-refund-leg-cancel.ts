/**
 * One-leg cancel must never select jobs/events by payment reference alone.
 * Run: npx tsx scripts/check-refund-leg-cancel.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertLegCancelTarget,
  bothReturnLegsCancelled,
  calendarEventIdsByLegFromCreated,
  calendarEventMatchesTrackingJob,
  nextCancelledLegs,
  otherCalendarEventIds,
  pickStoredCalendarEventIdForLeg,
  resolveTrackingJobLeg,
  tokensSafeForSingleLegCancel,
} from "../shared/refund-leg-cancel";
import { resolveRefundAmountForAction } from "../shared/refund-ops";
import { selectTrackingJobsForRefundMark } from "../shared/tracking";
import { buildCustomerCancellationEmails } from "../shared/booking-notifications";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Identifiers: token + journeyLeg, not payment ref ===");
{
  const outbound = {
    token: "tok-out",
    paymentReference: "PAY-1",
    journeyLeg: "outbound" as const,
    pairedToken: "tok-ret",
    tripDate: "2026-09-20",
    tripTime: "08:00",
    pickupLabel: "Home",
    dropoffLabel: "BFS",
  };
  const booking = {
    paymentReference: "PAY-1",
    returnJourney: true,
    tripDate: "2026-09-20",
    returnDate: "2026-09-27",
    pickupLabel: "Home",
    dropoffLabel: "BFS",
  };
  assert.equal(resolveTrackingJobLeg(outbound, booking), "outbound");
  const ok = assertLegCancelTarget({
    job: outbound,
    requestedToken: "tok-out",
    cancelLeg: "outbound",
    booking,
  });
  assert.equal(ok.ok, true);

  const wrongLeg = assertLegCancelTarget({
    job: outbound,
    requestedToken: "tok-out",
    cancelLeg: "return",
    booking,
  });
  assert.equal(wrongLeg.ok, false);

  const foreign = assertLegCancelTarget({
    job: { ...outbound, paymentReference: "PAY-OTHER" },
    requestedToken: "tok-out",
    cancelLeg: "outbound",
    booking,
  });
  assert.equal(foreign.ok, false);

  const missingToken = assertLegCancelTarget({
    job: outbound,
    requestedToken: "",
    cancelLeg: "outbound",
    booking,
  });
  assert.equal(missingToken.ok, false);
  console.log("OK  target is token + journeyLeg; payment ref is membership only");
}

console.log("=== Whole-booking fan-out still exists; one-leg forbids it ===");
{
  const outbound = {
    token: "tok-out",
    paymentReference: "PAY-1",
    journeyLeg: "outbound" as const,
    pairedToken: "tok-ret",
  };
  const inbound = {
    token: "tok-ret",
    paymentReference: "PAY-1",
    journeyLeg: "return" as const,
    pairedToken: "tok-out",
  };
  const fanOut = selectTrackingJobsForRefundMark({
    primary: outbound,
    relatedByPaymentRef: [outbound, inbound],
    pairedJob: inbound,
  });
  assert.equal(fanOut.length, 2);
  const unsafe = tokensSafeForSingleLegCancel({
    cancelledToken: "tok-out",
    markedTokens: fanOut.map((job) => job.token),
    pairedToken: "tok-ret",
  });
  assert.equal(unsafe.ok, false);
  const safe = tokensSafeForSingleLegCancel({
    cancelledToken: "tok-out",
    markedTokens: ["tok-out"],
    pairedToken: "tok-ret",
  });
  assert.equal(safe.ok, true);
  console.log("OK  one-leg mark set cannot include the paired token");
}

console.log("=== Calendar: never cancel the other event id ===");
{
  const byLeg = calendarEventIdsByLegFromCreated({
    returnJourney: true,
    eventIds: ["evt-out", "evt-ret"],
  });
  assert.equal(byLeg.outbound, "evt-out");
  assert.equal(byLeg.return, "evt-ret");
  const picked = pickStoredCalendarEventIdForLeg({
    cancelLeg: "outbound",
    calendarEventIdsByLeg: byLeg,
  });
  assert.equal(picked.eventId, "evt-out");
  const others = otherCalendarEventIds({
    calendarEventIds: ["evt-out", "evt-ret"],
    calendarEventIdsByLeg: byLeg,
    keepEventId: picked.eventId,
  });
  assert.deepEqual(others, ["evt-ret"]);
  assert.equal(others.includes("evt-out"), false);
  const mismatch = pickStoredCalendarEventIdForLeg({
    cancelLeg: "outbound",
    jobCalendarEventId: "evt-out",
    calendarEventIdsByLeg: { outbound: "evt-other", return: "evt-ret" },
  });
  assert.equal(mismatch.eventId, null);
  assert.equal(
    calendarEventMatchesTrackingJob("2026-09-20T08:00:00+01:00", {
      pickupAt: "2026-09-20T08:00",
      tripDate: "2026-09-20",
      tripTime: "08:00",
    }),
    true,
  );
  console.log("OK  calendar resolver keeps the other event id");
}

console.log("=== Booking stays confirmed until both legs cancelled ===");
{
  assert.deepEqual(nextCancelledLegs(["outbound"], "return"), ["outbound", "return"]);
  assert.equal(bothReturnLegsCancelled(["outbound"], true), false);
  assert.equal(bothReturnLegsCancelled(["outbound", "return"], true), true);
  assert.equal(bothReturnLegsCancelled(["outbound"], false), true);
  console.log("OK  remaining leg keeps the booking operationally confirmed");
}

console.log("=== Money reuses typed partial path ===");
{
  const resolved = resolveRefundAmountForAction({
    actionKind: "cancel_leg_partial_refund",
    remainingBalance: 148.7,
    amount: 70.44,
    refundFullRemaining: false,
  });
  assert.equal(resolved.refundAmount, 70.44);
  const opsOnly = resolveRefundAmountForAction({
    actionKind: "cancel_leg_partial_refund",
    remainingBalance: 148.7,
    amount: 0,
    refundFullRemaining: false,
  });
  assert.equal(opsOnly.refundAmount, 0);
  console.log("OK  typed partial amount (or ops-only £0) for one-leg cancel");
}

console.log("=== Customer email names the cancelled leg ===");
{
  const emails = buildCustomerCancellationEmails({
    customerName: "Jane",
    paymentReference: "PAY-1",
    refundAmount: "£70.44",
    refundAmountValue: 70.44,
    originalAmount: "£148.70",
    originalAmountValue: 148.7,
    cumulativeRefunded: "£70.44",
    remainingPaid: "£78.26",
    tripLabel: "Home → BFS",
    pickupLabel: "Home",
    dropoffLabel: "BFS",
    tripDate: "2026-09-20",
    tripTime: "08:00",
    cancelBooking: false,
    within24h: false,
    reasonCategory: "customer_cancelled_over_24h",
    bookingRemainsActive: true,
    actionKind: "cancel_leg_partial_refund",
    cancelledLeg: "outbound",
  });
  assert.match(emails.customer!.text, /outbound journey/i);
  assert.match(emails.customer!.text, /return journey remains booked/i);
  assert.doesNotMatch(emails.customer!.text, /has been CANCELLED/);
  assert.match(emails.owner!.body, /Cancelled leg: outbound/);
  console.log("OK  one-leg email keeps the other journey booked");
}

console.log("=== Source wiring ===");
{
  const handlers = read("workers/addresses/src/refund-handlers.ts");
  assert.match(handlers, /cancel_leg_partial_refund/);
  assert.match(handlers, /onlyThisJob: true/);
  assert.match(handlers, /assertLegCancelTarget/);
  assert.doesNotMatch(
    handlers,
    /cancel_leg_partial_refund[\s\S]{0,200}findTrackingJobsByPaymentReference/,
  );
  const store = read("workers/addresses/src/tracking-store.ts");
  assert.match(store, /onlyThisJob/);
  const modal = read("src/components/OwnerCancelRefundModal.tsx");
  assert.match(modal, /cancel_outbound_partial/);
  assert.match(modal, /cancel_return_partial/);
  assert.match(modal, /cancelLeg/);
  const api = read("src/lib/refund-api.ts");
  assert.match(api, /cancelLeg: input\.cancelLeg/);
  console.log("OK  Worker + modal + API expose one-leg cancel");
}

console.log("\nAll one-leg cancel checks passed.");
