/**
 * Owner quiet hours (22:00–07:00): response deadlines and overnight short-notice blocks.
 *   npx tsx scripts/check-owner-quiet-hours.ts
 */
import assert from "node:assert/strict";
import {
  addOwnerAwakeHours,
  earliestOvernightPickup,
  isPickupTooSoonForOwnerOvernight,
  overnightTooSoonBody,
} from "../shared/owner-quiet-hours";
import { shortNoticeResponseExpiresAtIso } from "../shared/short-notice-booking";
import { classifyPickupLeadWindow } from "../shared/booking-notice";

const Z = (s: string) => new Date(s); // November = GMT, so Z == UK time
const exp = (at: string, hours: number, date: string, time: string) =>
  shortNoticeResponseExpiresAtIso(at, hours, { tripDate: date, tripTime: time });

// Awake-hour counting
assert.equal(addOwnerAwakeHours(Z("2026-11-11T12:00:00Z"), 4).toISOString(), "2026-11-11T16:00:00.000Z");
assert.equal(addOwnerAwakeHours(Z("2026-11-11T21:00:00Z"), 4).toISOString(), "2026-11-12T10:00:00.000Z");
assert.equal(addOwnerAwakeHours(Z("2026-11-11T23:30:00Z"), 4).toISOString(), "2026-11-12T11:00:00.000Z");
assert.equal(addOwnerAwakeHours(Z("2026-11-12T03:00:00Z"), 4).toISOString(), "2026-11-12T11:00:00.000Z");
console.log("ok awake-hour counting skips 22:00–07:00");

// Deadlines
// Daytime unchanged: 17:08 request, 20:00 pickup → 19:00.
assert.equal(exp("2026-11-11T17:08:00Z", 4, "2026-11-11", "20:00"), "2026-11-11T19:00:00.000Z");
// 23:00 request, 09:00 pickup → answer by 08:00 (window would run to 11:00).
assert.equal(exp("2026-11-11T23:00:00Z", 4, "2026-11-12", "09:00"), "2026-11-12T08:00:00.000Z");
// 01:00 request, 14:00 pickup → full 4 awake hours from 07:00 → 11:00.
assert.equal(exp("2026-11-12T01:00:00Z", 4, "2026-11-12", "14:00"), "2026-11-12T11:00:00.000Z");
// 18:00 request, 23:30 pickup → 22:00 (would be 22:30, but he's asleep).
assert.equal(exp("2026-11-11T18:00:00Z", 4, "2026-11-11", "23:30"), "2026-11-11T22:00:00.000Z");
// 21:00 request, pickup tomorrow 17:00 → 1h tonight + 3h from 07:00 → 10:00.
assert.equal(exp("2026-11-11T21:00:00Z", 4, "2026-11-12", "17:00"), "2026-11-12T10:00:00.000Z");
// Summer time: 23:00 BST request (22:00Z), 09:00 BST pickup → 08:00 BST = 07:00Z.
assert.equal(exp("2026-07-01T22:00:00Z", 4, "2026-07-02", "09:00"), "2026-07-02T07:00:00.000Z");
console.log("ok response deadlines respect quiet hours and pickup");

// Overnight blocks
const blocked = (now: string, d: string, t: string) => isPickupTooSoonForOwnerOvernight(d, t, Z(now));
assert.equal(blocked("2026-11-12T01:00:00Z", "2026-11-12", "06:30"), true);
assert.equal(blocked("2026-11-12T01:00:00Z", "2026-11-12", "08:10"), true);
assert.equal(blocked("2026-11-12T01:00:00Z", "2026-11-12", "08:15"), false);
assert.equal(blocked("2026-11-11T21:50:00Z", "2026-11-11", "23:55"), true); // only 10 awake minutes
assert.equal(blocked("2026-11-11T18:00:00Z", "2026-11-11", "23:30"), false); // 4 awake hours
assert.equal(blocked("2026-11-11T14:00:00Z", "2026-11-11", "16:30"), false); // daytime: unchanged
assert.deepEqual(earliestOvernightPickup(Z("2026-11-11T23:00:00Z")), { time: "08:15", tomorrow: true });
assert.deepEqual(earliestOvernightPickup(Z("2026-11-12T02:00:00Z")), { time: "08:15", tomorrow: false });
assert.match(overnightTooSoonBody(Z("2026-11-11T23:00:00Z")), /from 08:15 tomorrow/);
console.log("ok overnight short-notice pickups that can't be confirmed are blocked");

// Classifier (12h notice, 2h lead)
assert.equal(classifyPickupLeadWindow("2026-11-12", "06:30", Z("2026-11-12T01:00:00Z"), 12, 2), "too_soon");
assert.equal(classifyPickupLeadWindow("2026-11-12", "09:00", Z("2026-11-12T01:00:00Z"), 12, 2), "short_notice");
assert.equal(classifyPickupLeadWindow("2026-11-12", "16:00", Z("2026-11-12T01:00:00Z"), 12, 2), "normal");
console.log("ok quote screen classification");
console.log("\nowner quiet-hours checks passed");
