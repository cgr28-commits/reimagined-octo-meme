/**
 * 24/7 booking approval policy — tiers, overnight, 7am clock start, GMT/BST.
 *   npx tsx scripts/check-approval-policy.ts
 */
import assert from "node:assert/strict";
import {
  addApprovalMinutes,
  decideBookingApproval,
  decideBookingApprovalForTrip,
  isOvernight,
  nextApprovalClockStart,
} from "../shared/approval-policy";

const at = (iso: string) => new Date(iso);
const HOUR = 3600_000;
const decide = (submitted: string, leadHours: number) =>
  decideBookingApproval({
    submittedAt: at(submitted),
    pickupAt: new Date(at(submitted).getTime() + leadHours * HOUR),
  });

function manual(d: ReturnType<typeof decide>) {
  assert.equal(d.mode, "manual", JSON.stringify(d));
  return d as Extract<typeof d, { mode: "manual" }>;
}

// November = GMT, so Z == UK time.
// 1. Daytime 24h ahead → automatic.
assert.equal(decide("2026-11-12T12:00:00Z", 24).mode, "auto");
// Exactly 12h → automatic.
assert.equal(decide("2026-11-12T12:00:00Z", 12).mode, "auto");
console.log("ok 1 daytime 24h ahead auto-confirms");

// 2. Daytime 6h → 30 minutes.
let d = manual(decide("2026-11-12T12:00:00Z", 6));
assert.equal(d.windowMinutes, 30);
assert.equal(d.deadlineAt, "2026-11-12T12:30:00.000Z");
console.log("ok 2 daytime 6h → 30-minute approval");

// 3. Daytime 3h → 15 minutes.
d = manual(decide("2026-11-12T12:00:00Z", 3));
assert.equal(d.windowMinutes, 15);
assert.equal(d.deadlineAt, "2026-11-12T12:15:00.000Z");
console.log("ok 3 daytime 3h → 15-minute approval");

// 4. 90 minutes → 5 minutes.
d = manual(decide("2026-11-12T12:00:00Z", 1.5));
assert.equal(d.windowMinutes, 5);
assert.equal(d.deadlineAt, "2026-11-12T12:05:00.000Z");
console.log("ok 4 90 minutes ahead → 5-minute approval");

// 5. Overnight 24h ahead → manual, clock starts 07:00, 30 minutes.
d = manual(decide("2026-11-12T23:30:00Z", 24));
assert.equal(d.overnight, true);
assert.equal(d.windowMinutes, 30);
assert.equal(d.clockStartsAt, "2026-11-13T07:00:00.000Z");
assert.equal(d.deadlineAt, "2026-11-13T07:30:00.000Z");
// After midnight too.
d = manual(decide("2026-11-13T03:00:00Z", 30));
assert.equal(d.deadlineAt, "2026-11-13T07:30:00.000Z");
console.log("ok 5 overnight 24h ahead → manual, answer from 07:00");

// 6. Overnight 5h ahead (03:00 → 08:00) → 30 minutes from 07:00.
d = manual(decide("2026-11-13T03:00:00Z", 5));
assert.equal(d.windowMinutes, 30);
assert.equal(d.deadlineAt, "2026-11-13T07:30:00.000Z");
console.log("ok 6 overnight 5h ahead → 30-minute approval");

// 7. Overnight 90 minutes → 5 minutes; 06:00 → 07:30 pickup gives 07:05.
d = manual(decide("2026-11-13T06:00:00Z", 1.5));
assert.equal(d.windowMinutes, 5);
assert.equal(d.deadlineAt, "2026-11-13T07:05:00.000Z");
// 01:00 → 02:30 pickup: can't answer before pickup → rejected, never auto-confirmed.
assert.deepEqual(
  { mode: decide("2026-11-13T01:00:00Z", 1.5).mode },
  { mode: "reject" },
);
console.log("ok 7 overnight 90 minutes → 5-minute approval, or rejected if before 07:05");

// Deadline never beyond pickup.
for (const lead of [0.05, 0.08, 0.5, 1, 2, 3.9, 4, 11.9, 12, 20]) {
  for (const sub of ["2026-11-12T12:00:00Z", "2026-11-12T22:58:00Z", "2026-11-13T02:00:00Z", "2026-11-13T06:59:00Z"]) {
    const r = decide(sub, lead);
    if (r.mode === "manual") {
      assert.ok(new Date(r.deadlineAt).getTime() <= at(sub).getTime() + lead * HOUR, `${sub} ${lead}`);
    }
  }
}
// 4 minutes before pickup → rejected (5-minute window would pass pickup).
assert.equal(decide("2026-11-12T12:00:00Z", 4 / 60).mode, "reject");
// Pickup in the past → rejected.
assert.equal(decide("2026-11-12T12:00:00Z", -1).mode, "reject");
console.log("ok deadline never after pickup; impossible requests rejected");

// Window spanning 23:00 pauses overnight.
d = manual(decide("2026-11-12T22:50:00Z", 10));
assert.equal(d.overnight, false);
assert.equal(d.deadlineAt, "2026-11-13T07:20:00.000Z");
assert.equal(decide("2026-11-12T22:58:00Z", 1).mode, "reject");
console.log("ok window pauses 23:00–07:00");

// Boundaries.
assert.equal(isOvernight(at("2026-11-12T22:59:00Z")), false);
assert.equal(isOvernight(at("2026-11-12T23:00:00Z")), true);
assert.equal(isOvernight(at("2026-11-13T06:59:00Z")), true);
assert.equal(isOvernight(at("2026-11-13T07:00:00Z")), false);
console.log("ok overnight boundaries 23:00 / 07:00");

// 16. GMT/BST. Summer: UK = UTC+1.
assert.equal(isOvernight(at("2026-07-01T22:30:00Z")), true); // 23:30 BST
assert.equal(isOvernight(at("2026-07-01T21:30:00Z")), false); // 22:30 BST
assert.equal(nextApprovalClockStart(at("2026-07-01T22:30:00Z")).toISOString(), "2026-07-02T06:00:00.000Z");
// Clocks go back 25 Oct 2026 (02:00 BST → 01:00 GMT). Saturday 23:30 BST → Sunday 07:00 GMT.
assert.equal(nextApprovalClockStart(at("2026-10-24T22:30:00Z")).toISOString(), "2026-10-25T07:00:00.000Z");
// Clocks go forward 29 Mar 2026 (01:00 GMT → 02:00 BST). Saturday 23:30 GMT → Sunday 07:00 BST.
assert.equal(nextApprovalClockStart(at("2026-03-28T23:30:00Z")).toISOString(), "2026-03-29T06:00:00.000Z");
// Pickup by UK wall clock across the change: Sat 22:00 BST request for Sun 09:00 GMT = 12h elapsed → auto.
assert.equal(decideBookingApprovalForTrip("2026-10-25", "09:00", at("2026-10-24T21:00:00Z")).mode, "auto");
// Spring: Sat 21:30 GMT request for Sun 09:00 BST = 10.5h elapsed (not 11.5) → manual 30 min.
d = manual(decideBookingApprovalForTrip("2026-03-29", "09:00", at("2026-03-28T21:30:00Z")));
assert.equal(d.tier, "4_to_12h");
assert.equal(d.deadlineAt, "2026-03-28T22:00:00.000Z");
// Window crossing 23:00 on the night clocks go forward: 22:50 GMT → 10 min + 20 min from 07:00 BST.
assert.equal(addApprovalMinutes(at("2026-03-28T22:50:00Z"), 30).toISOString(), "2026-03-29T06:20:00.000Z");
console.log("ok 16 GMT/BST changes handled");

// 17. Shortly before pickup — 20 minutes ahead, daytime → 5 minutes, before pickup.
d = manual(decide("2026-11-12T15:00:00Z", 20 / 60));
assert.equal(d.deadlineAt, "2026-11-12T15:05:00.000Z");
console.log("ok 17 shortly before pickup → 5-minute approval");

// Recompute at card authorisation keeps manual and the original tier.
d = manual(
  decideBookingApproval({
    submittedAt: at("2026-11-12T12:10:00Z"),
    pickupAt: at("2026-11-13T02:00:00Z"),
    forceManual: true,
    tier: "4_to_12h",
  }),
);
assert.equal(d.deadlineAt, "2026-11-12T12:40:00.000Z");
console.log("ok recompute keeps manual + tier");

console.log("\nAll approval-policy checks passed.");
