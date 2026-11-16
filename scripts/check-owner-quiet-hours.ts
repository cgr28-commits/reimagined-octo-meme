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

// Deadlines now follow the 24/7 approval policy (scripts/check-approval-policy.ts).
// 17:08 request, 20:00 pickup (under 4h) → 15 minutes.
assert.equal(exp("2026-11-11T17:08:00Z", 4, "2026-11-11", "20:00"), "2026-11-11T17:23:00.000Z");
// 23:00 request, 09:00 pickup → clock starts 07:00, 30 minutes → 07:30.
assert.equal(exp("2026-11-11T23:00:00Z", 4, "2026-11-12", "09:00"), "2026-11-12T07:30:00.000Z");
// 01:00 request, 05:00 pickup → can't answer before pickup → expires immediately.
assert.equal(exp("2026-11-12T01:00:00Z", 4, "2026-11-12", "05:00"), "2026-11-12T01:00:00.000Z");
// Summer time: 23:30 BST request (22:30Z), 09:00 BST pickup → 07:30 BST = 06:30Z.
assert.equal(exp("2026-07-01T22:30:00Z", 4, "2026-07-02", "09:00"), "2026-07-02T06:30:00.000Z");
console.log("ok response deadlines follow the approval policy");

// Requests that can't be answered before pickup
const blocked = (now: string, d: string, t: string) => isPickupTooSoonForOwnerOvernight(d, t, Z(now));
assert.equal(blocked("2026-11-12T01:00:00Z", "2026-11-12", "06:30"), true);
// 01:00 → 07:xx is 6h+ lead → 30-minute window from 07:00 → 07:30.
assert.equal(blocked("2026-11-12T01:00:00Z", "2026-11-12", "07:29"), true);
assert.equal(blocked("2026-11-12T01:00:00Z", "2026-11-12", "07:30"), false);
// 06:00 → 07:05 is under 2h → 5-minute window → 07:05.
assert.equal(blocked("2026-11-12T06:00:00Z", "2026-11-12", "07:05"), false);
assert.equal(blocked("2026-11-11T22:58:00Z", "2026-11-11", "23:55"), true);
assert.equal(blocked("2026-11-11T18:00:00Z", "2026-11-11", "23:30"), false);
assert.equal(blocked("2026-11-11T14:00:00Z", "2026-11-11", "16:30"), false);
assert.deepEqual(earliestOvernightPickup(Z("2026-11-11T23:00:00Z")), { time: "07:30", tomorrow: true });
assert.deepEqual(earliestOvernightPickup(Z("2026-11-12T02:00:00Z")), { time: "07:30", tomorrow: false });
assert.match(overnightTooSoonBody(Z("2026-11-11T23:00:00Z")), /from 07:30 tomorrow/);
assert.doesNotMatch(overnightTooSoonBody(Z("2026-11-11T23:00:00Z")), /overnight|10pm|11pm|7am/);
console.log("ok requests that can't be answered before pickup are blocked, without revealing rules");

// Classifier (12h notice, 2h lead)
assert.equal(classifyPickupLeadWindow("2026-11-12", "06:30", Z("2026-11-12T01:00:00Z"), 12, 2), "too_soon");
assert.equal(classifyPickupLeadWindow("2026-11-12", "09:00", Z("2026-11-12T01:00:00Z"), 12, 2), "short_notice");
// Overnight submissions are never "normal" (always owner approval).
assert.equal(classifyPickupLeadWindow("2026-11-12", "16:00", Z("2026-11-12T01:00:00Z"), 12, 2), "short_notice");
assert.equal(classifyPickupLeadWindow("2026-11-13", "16:00", Z("2026-11-12T12:00:00Z"), 12, 2), "normal");
console.log("ok quote screen classification");
console.log("\nowner quiet-hours checks passed");

// WhatsApp bot reply
import("../shared/whatsapp-quote-bot").then(({ buildWhatsAppUnavailableReply }) => {
  const text = buildWhatsAppUnavailableReply({
    leg: "outbound",
    draft: { outboundDate: "2026-11-12", outboundTime: "06:30" } as never,
    reason: "overnight",
    hasAlternatives: false,
    now: new Date("2026-11-11T23:30:00Z"),
  });
  assert.doesNotMatch(text, /overnight|10pm/);
  assert.match(text, /earliest pickup we can take is 07:30 tomorrow/);
  console.log("ok WhatsApp overnight reply");
});
